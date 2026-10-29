import { BadRequestException, Body, Controller, Get, HttpException, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, records, users } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { RedisService } from '../common/redis.service';
import { StudentsService } from '../students/students.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';

/** Online admission: a public form per centre (no login) creates an application; the office moves it through stages and admits (creates the student + parent login). */
@Controller()
export class AdmissionsController {
  constructor(private dbs: DbService, private redis: RedisService, private students: StudentsService, private notify: NotificationsService, private platform: PlatformService) {}

  @Public() @Get('public/admission/:centreId') async info(@Param('centreId') id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException(); const [c] = await this.dbs.db.select().from(centres).where(eq(centres.id, id)); if (!c) throw new NotFoundException('School not found');
    const s = await this.platform.settings(id); const bs = await this.dbs.db.select({ className: batches.className, name: batches.name }).from(batches).where(eq(batches.centreId, id));
    const classes = [...new Set(bs.map((b) => b.className || b.name))]; return { name: c.name, city: c.city, address: s.address, phone: s.phone, session: s.academicSession, type: c.institutionType, classes };
  }

  @Public() @Post('public/admission/:centreId') async apply(@Param('centreId') id: string, @Body() b: any, @Req() req: any) {
    if (b.website) return { ok: true }; // honeypot
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim(); const n = await this.redis.hit(`adm:${ip}`, 3600); if (n > 8) throw new HttpException('Too many applications from this device. Please try later or visit the school.', 429);
    const [c] = await this.dbs.db.select().from(centres).where(eq(centres.id, id)); if (!c) throw new NotFoundException('School not found');
    const mob = String(b.parentMobile || '').replace(/\D/g, '').slice(-10); if (!String(b.childName || '').trim()) throw new BadRequestException("Child's name is required"); if (mob.length !== 10) throw new BadRequestException('Enter a 10-digit parent mobile number'); if (!String(b.classApplying || '').trim()) throw new BadRequestException('Select the class applying for');
    const data = { dob: b.dob, gender: b.gender, classApplying: b.classApplying, fatherName: b.fatherName, motherName: b.motherName, parentMobile: mob, parentEmail: String(b.parentEmail || '').trim().toLowerCase(), address: b.address, previousSchool: b.previousSchool, category: b.category, religion: b.religion, bloodGroup: b.bloodGroup, documents: b.documents, source: 'Online form' };
    const [row] = await this.dbs.db.insert(records).values({ centreId: id, kind: 'admission', title: String(b.childName).trim().slice(0, 120), date: new Date().toISOString().slice(0, 10), status: 'new', data: JSON.stringify(data) }).returning();
    const admins = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, id), eq(users.role, 'ADMIN'))); this.notify.notifyUsers(id, admins.map((a) => a.id), `New admission application: ${row.title}`, `Class ${data.classApplying} · parent ${mob}`, { urgent: true, data: { type: 'admission', id: row.id } });
    return { ok: true, reference: row.id.slice(0, 8).toUpperCase() };
  }

  /** Admit: creates the student (with admission no, parent login) from the application and closes it. */
  @Post('admissions/:id/admit') @Mod('admissions') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async admit(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { batchId: string; rollNo?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [r] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'admission'))); if (!r) throw new NotFoundException();
    if (r.status === 'admitted') throw new BadRequestException('Already admitted'); const d = JSON.parse(r.data); const mob = String(d.parentMobile || '').replace(/\D/g, '').slice(-10); if (mob.length !== 10) throw new BadRequestException('Application has no valid parent mobile');
    if (!b.batchId) throw new BadRequestException('Choose the class/section to admit into');
    const st = await this.students.create(centreId, { name: r.title, parentMobile: mob, parentName: d.fatherName || d.motherName, parentEmail: d.parentEmail || undefined, batchId: b.batchId, rollNo: b.rollNo, dob: d.dob || undefined, gender: d.gender, fatherName: d.fatherName, motherName: d.motherName, address: d.address, category: d.category, religion: d.religion, bloodGroup: d.bloodGroup, previousSchool: d.previousSchool });
    await db.update(records).set({ status: 'admitted', studentId: st.id, data: JSON.stringify({ ...d, studentId: st.id, admissionNo: st.admissionNo }), updatedAt: new Date() }).where(eq(records.id, id));
    return { ok: true, studentId: st.id, admissionNo: st.admissionNo, rollNo: st.rollNo };
  }
}
