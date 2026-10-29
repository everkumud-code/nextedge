import { BadRequestException, Body, Controller, Get, HttpException, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, files, records, users } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { RedisService } from '../common/redis.service';
import { StudentsService } from '../students/students.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';
import { MessagingService } from '../messaging/messaging.service';
import { Upload, normalizeUpload, saveFile } from '../files/file-store';

export const ADMISSION_DOCS = ['Photo of child', 'Birth certificate', 'Previous school report card / TC', 'Aadhaar card (child or parent)'];
export const STAGE_LABEL: Record<string, string> = { new: 'Application received', 'documents-pending': 'Documents needed', interview: 'Interview / test scheduled', approved: 'Approved — please complete the admission at the school office', waitlisted: 'On the waiting list', admitted: 'Admitted — welcome!', rejected: 'Not selected this time' };
const STAGES = ['new', 'documents-pending', 'interview', 'approved', 'admitted'];
const ip = (req: any) => (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

/** Online admission: public form (optional mobile OTP, documents), status tracking for the parent, and the office's admit action that creates the student. */
@Controller()
export class AdmissionsController {
  constructor(private dbs: DbService, private redis: RedisService, private students: StudentsService, private notify: NotificationsService, private platform: PlatformService, private msg: MessagingService, private jwt: JwtService) {}

  private async centre(id: string) { if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException(); const [c] = await this.dbs.db.select().from(centres).where(eq(centres.id, id)); if (!c) throw new NotFoundException('School not found'); return c; }
  private async otpChannel(id: string) { const st = await this.msg.status(id); return st.whatsapp.ready ? 'whatsapp' : st.sms.ready ? 'sms' : null; }
  private mobile(v: any) { return String(v || '').replace(/\D/g, '').slice(-10); }

  @Public() @Get('public/admission/:centreId') async info(@Param('centreId') id: string) {
    const c = await this.centre(id); const s = await this.platform.settings(id); const bs = await this.dbs.db.select({ className: batches.className, name: batches.name }).from(batches).where(eq(batches.centreId, id));
    const classes = [...new Set(bs.map((b) => b.className || b.name))]; return { name: c.name, city: c.city, address: s.address, phone: s.phone, session: s.academicSession, type: c.institutionType, classes, otpRequired: !!(await this.otpChannel(id)), documents: ADMISSION_DOCS };
  }

  /** Step 1 of the OTP check: send a code to the parent's mobile (WhatsApp, else SMS). */
  @Public() @Post('public/admission/:centreId/otp') async sendOtp(@Param('centreId') id: string, @Body() b: { mobile: string }, @Req() req: any) {
    await this.centre(id); const mob = this.mobile(b.mobile); if (mob.length !== 10) throw new BadRequestException('Enter a 10-digit mobile number'); const ch = await this.otpChannel(id); if (!ch) throw new BadRequestException('OTP check is not switched on for this school');
    if ((await this.redis.hit(`adm:otp:ip:${ip(req)}`, 3600)) > 12 || (await this.redis.hit(`adm:otp:m:${id}:${mob}`, 3600)) > 5) throw new HttpException('Too many OTP requests. Please try again after an hour.', 429);
    const code = String(Math.floor(100000 + Math.random() * 900000)); await this.redis.set(`adm:otp:code:${id}:${mob}`, code, 600); await this.redis.del(`adm:otp:fails:${id}:${mob}`);
    const [c] = await this.dbs.db.select({ name: centres.name }).from(centres).where(eq(centres.id, id)); const text = `${code} is your OTP for the admission form of ${c.name}. Valid for 10 minutes.`;
    let r = ch === 'whatsapp' ? await this.msg.sendWhatsApp(id, mob, 'otp', { code, text }) : await this.msg.sendSms(id, mob, 'otp', { code, text }); let via = ch;
    if (!r.sent && ch === 'whatsapp' && (await this.msg.status(id)).sms.ready) { r = await this.msg.sendSms(id, mob, 'otp', { code, text }); via = 'sms'; }
    if (!r.sent) { await this.redis.del(`adm:otp:code:${id}:${mob}`); throw new HttpException(`The OTP could not be sent (${r.reason}). Please try again or contact the school.`, 502); }
    return { sent: true, via, to: `******${mob.slice(-4)}` };
  }
  @Public() @Post('public/admission/:centreId/verify') async verifyOtp(@Param('centreId') id: string, @Body() b: { mobile: string; code: string }) {
    const mob = this.mobile(b.mobile); const key = `adm:otp:code:${id}:${mob}`; const stored = await this.redis.get(key); if (!stored) throw new BadRequestException('OTP expired. Please request a new one.');
    if (stored !== String(b.code || '').trim()) { if ((await this.redis.hit(`adm:otp:fails:${id}:${mob}`, 600)) >= 5) { await this.redis.del(key); throw new BadRequestException('Too many wrong attempts. Please request a new OTP.'); } throw new BadRequestException('Wrong OTP. Please check and try again.'); }
    await this.redis.del(key); return { otpToken: await this.jwt.signAsync({ adm: id, mobile: mob }, { expiresIn: '45m' }) };
  }

  @Public() @Post('public/admission/:centreId') async apply(@Param('centreId') id: string, @Body() b: any, @Req() req: any) {
    if (b.website) return { ok: true }; // honeypot
    if ((await this.redis.hit(`adm:${ip(req)}`, 3600)) > 8) throw new HttpException('Too many applications from this device. Please try later or visit the school.', 429);
    const c = await this.centre(id); const mob = this.mobile(b.parentMobile); if (!String(b.childName || '').trim()) throw new BadRequestException("Child's name is required"); if (mob.length !== 10) throw new BadRequestException('Enter a 10-digit parent mobile number'); if (!String(b.classApplying || '').trim()) throw new BadRequestException('Choose the class you are applying for');
    if (await this.otpChannel(id)) { let ok = false; try { const t: any = await this.jwt.verifyAsync(String(b.otpToken || '')); ok = t.adm === id && t.mobile === mob; } catch { /* invalid */ } if (!ok) throw new BadRequestException('Please verify the parent mobile number with the OTP first'); }
    const docs: Upload[] = (Array.isArray(b.documents) ? b.documents : []).slice(0, 6).map((d: any) => ({ ownerKind: 'admission-doc', name: `${String(d.type || 'Document').slice(0, 60)} - ${String(d.name || 'file').slice(0, 60)}`, mime: String(d.mime || ''), data: String(d.data || '') }));
    const ready = []; for (const d of docs) { try { ready.push(await normalizeUpload(d)); } catch (e: any) { throw new BadRequestException(`${d.name}: ${e.message}`); } }
    const data = { dob: b.dob, gender: b.gender, classApplying: b.classApplying, fatherName: b.fatherName, motherName: b.motherName, parentMobile: mob, parentEmail: String(b.parentEmail || '').trim().toLowerCase(), address: b.address, previousSchool: b.previousSchool, category: b.category, religion: b.religion, bloodGroup: b.bloodGroup, source: 'online', documents: docs.length };
    const [row] = await this.dbs.db.insert(records).values({ centreId: id, kind: 'admission', title: String(b.childName).trim().slice(0, 120), date: new Date().toISOString().slice(0, 10), status: 'new', data: JSON.stringify(data) }).returning();
    for (let i = 0; i < docs.length; i++) await saveFile(this.dbs.db, id, { ...docs[i], ownerId: row.id }, ready[i]);
    const reference = row.id.slice(0, 8).toUpperCase(); const admins = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, id), eq(users.role, 'ADMIN')));
    this.notify.notifyUsers(id, admins.map((a) => a.id), `New admission application: ${row.title}`, `Class ${data.classApplying} · parent ${mob}${docs.length ? ` · ${docs.length} document(s)` : ''}`, { urgent: true, data: { type: 'admission', id: row.id } });
    this.msg.contact(id, { mobile: mob, email: data.parentEmail }, `Application received — ${c.name}`, `We received the admission application for ${row.title}. Your reference is ${reference}. Track it any time with this reference and your mobile number.`, 'admission').catch(() => {});
    return { ok: true, reference, documents: docs.length };
  }

  /** The parent checks progress with the reference and the mobile number used on the form. */
  @Public() @Get('public/admission/:centreId/status') async status(@Param('centreId') id: string, @Query('ref') ref: string, @Query('mobile') mobile: string, @Req() req: any) {
    await this.centre(id); if ((await this.redis.hit(`adm:track:${ip(req)}`, 3600)) > 40) throw new HttpException('Too many checks. Please try later.', 429);
    const r = String(ref || '').trim().toLowerCase(); const mob = this.mobile(mobile); if (!/^[0-9a-f]{8}$/.test(r) || mob.length !== 10) throw new BadRequestException('Enter the 8-character reference and the 10-digit mobile number');
    const [row] = await this.dbs.db.select().from(records).where(and(eq(records.centreId, id), eq(records.kind, 'admission'), sql`${records.id}::text like ${r + '%'}`)).limit(1); const d = row ? JSON.parse(row.data) : null;
    if (!row || this.mobile(d.parentMobile) !== mob) throw new NotFoundException('No application found with this reference and mobile number');
    const [{ n }] = await this.dbs.db.select({ n: sql<number>`count(*)` }).from(files).where(and(eq(files.centreId, id), eq(files.ownerKind, 'admission-doc'), eq(files.ownerId, row.id)));
    const idx = STAGES.indexOf(row.status); return { reference: r.toUpperCase(), childName: row.title, classApplying: d.classApplying, appliedOn: row.date, status: row.status, label: STAGE_LABEL[row.status] || row.status, stages: STAGES.map((s, i) => ({ key: s, label: STAGE_LABEL[s].split(' — ')[0], done: idx >= 0 && i <= idx })), remark: d.publicRemark || null, interview: d.interviewDate ? { date: d.interviewDate, time: d.interviewTime || null } : null, documents: Number(n), admissionNo: row.status === 'admitted' ? d.admissionNo || null : null };
  }

  /** Admit: creates the student (with admission no, parent login) from the application and closes it. The child's photo from the form becomes the student photo. */
  @Post('admissions/:id/admit') @Mod('admissions') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async admit(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { batchId: string; rollNo?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [r] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'admission'))); if (!r) throw new NotFoundException();
    if (r.status === 'admitted') throw new BadRequestException('Already admitted'); const d = JSON.parse(r.data); const mob = this.mobile(d.parentMobile); if (mob.length !== 10) throw new BadRequestException('Application has no valid parent mobile');
    if (!b.batchId) throw new BadRequestException('Choose the class/section to admit into');
    const st = await this.students.create(centreId, { name: r.title, parentMobile: mob, parentName: d.fatherName || d.motherName, parentEmail: d.parentEmail || undefined, batchId: b.batchId, rollNo: b.rollNo, dob: d.dob || undefined, gender: d.gender, fatherName: d.fatherName, motherName: d.motherName, address: d.address, category: d.category, religion: d.religion, bloodGroup: d.bloodGroup, previousSchool: d.previousSchool } as any);
    await db.update(records).set({ status: 'admitted', studentId: st.id, data: JSON.stringify({ ...d, studentId: st.id, admissionNo: st.admissionNo }), updatedAt: new Date() }).where(eq(records.id, id));
    const [photo] = await db.select().from(files).where(and(eq(files.centreId, centreId), eq(files.ownerKind, 'admission-doc'), eq(files.ownerId, id), sql`${files.name} like 'Photo of child%'`, sql`${files.mime} = 'image/jpeg'`)).limit(1);
    if (photo) await saveFile(db, centreId, { ownerKind: 'student-photo', ownerId: st.id, name: photo.name, mime: photo.mime, data: photo.data }).catch(() => {});
    this.msg.contact(centreId, { mobile: mob, email: d.parentEmail }, 'Admission confirmed', `${r.title} is admitted. Admission no ${st.admissionNo}. You can now log in to the NextEdge app with this mobile number.`, 'admission').catch(() => {});
    return { ok: true, studentId: st.id, admissionNo: st.admissionNo, rollNo: st.rollNo, photo: !!photo };
  }
}
