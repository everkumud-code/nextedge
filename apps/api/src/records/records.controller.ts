import { Body, Controller, Delete, Get, Param, Post, Put, Query, BadRequestException, ForbiddenException, Res } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, facultyBatches, records, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';
import { STAGE_LABEL } from '../admissions/admissions.controller';
import { PlatformService } from '../platform/platform.service';
import { KINDS, RECORD_MODULES } from './kinds';

const STAFFY = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'];
/** One controller for every record kind. Module access is checked per kind (feature flag + staff privilege). */
@Controller('records')
export class RecordsController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService, private msg: MessagingService) {}

  private kind(k: string) { const kd = KINDS[k]; if (!kd) throw new BadRequestException(`Unknown record kind ${k}`); return kd; }
  private async features(u: JwtUser): Promise<string[] | null> { if (!u.centreId || u.role === 'SUPER_ADMIN') return null; const s = await this.platform.settings(u.centreId); return s.features.length ? s.features : null; }
  private async allowed(u: JwtUser, k: string) {
    const kd = this.kind(k);
    if (u.role === 'SUPER_ADMIN') return kd;
    const f = await this.features(u); if (f && !f.includes(kd.module)) throw new ForbiddenException(`${RECORD_MODULES[kd.module]} is not enabled for this centre.`);
    if ((u.role === 'FACULTY' || u.role === 'STAFF') && !(u.modules || []).includes(kd.module)) throw new ForbiddenException(`You do not have access to ${RECORD_MODULES[kd.module]}. Ask the owner.`);
    return kd;
  }

  @Get('kinds') async kinds(@CurrentUser() u: JwtUser) { const f = await this.features(u); return Object.values(KINDS).filter((k) => !f || f.includes(k.module)).filter((k) => !['FACULTY', 'STAFF'].includes(u.role) || (u.modules || []).includes(k.module)); }
  @Get('modules') modules() { return RECORD_MODULES; }

  /** Student / parent: teachers of my child's class (for rating and PTM). */
  @Get('my-teachers') async myTeachers(@CurrentUser() u: JwtUser, @Query('studentId') studentId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const mine = await myStudents(db, u, centreId); const st = mine.find((s) => s.id === studentId) || mine[0]; if (!st?.batchId) return [];
    const fac = await db.select({ id: users.id, name: users.name, subject: facultyBatches.subject }).from(facultyBatches).innerJoin(users, eq(users.id, facultyBatches.facultyId)).where(eq(facultyBatches.batchId, st.batchId));
    const [b] = await db.select({ classTeacherId: batches.classTeacherId }).from(batches).where(eq(batches.id, st.batchId)); const out = [...fac.map((f) => ({ id: f.id, name: f.name, subject: f.subject || '' }))];
    if (b?.classTeacherId && !out.some((o) => o.id === b.classTeacherId)) { const [ct] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, b.classTeacherId)); if (ct) out.unshift({ id: ct.id, name: ct.name, subject: 'Class teacher' }); }
    return out;
  }

  /** Staff view: all records of a kind (filters: studentId, status, from, to). */
  @Get(':kind') @Roles(...STAFFY) async list(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Query('studentId') studentId?: string, @Query('status') status?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('centreId') c?: string) {
    await this.allowed(u, k); const centreId = centreOf(u, c); const db = this.dbs.db;
    const conds: any[] = [eq(records.centreId, centreId), eq(records.kind, k)]; if (studentId) conds.push(eq(records.studentId, studentId)); if (status) conds.push(eq(records.status, status));
    let rows = await db.select().from(records).where(and(...conds)).orderBy(desc(records.date), desc(records.createdAt)).limit(1000);
    if (from) rows = rows.filter((r) => !r.date || r.date >= from); if (to) rows = rows.filter((r) => !r.date || r.date <= to);
    return this.hydrate(centreId, rows);
  }

  /** Parent / student / staff: records about me (or my children) that are parent-visible, plus centre-wide ones (holidays, events, gallery, lessons, activities). */
  @Get('mine/all') async mine(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('kind') kind?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const mine = ['STUDENT', 'PARENT'].includes(u.role) ? await myStudents(db, u, centreId) : [];
    const conds: any[] = [eq(records.centreId, centreId), eq(records.parentVisible, true)]; if (kind) conds.push(eq(records.kind, kind));
    const rows = await db.select().from(records).where(and(...conds)).orderBy(desc(records.date), desc(records.createdAt)).limit(500);
    const ok = rows.filter((r) => { const kd = KINDS[r.kind]; if (!kd) return false; if (r.kind === 'ptm-slot') return r.status === 'open' || mine.some((s) => s.id === r.studentId) || STAFFY.includes(u.role); if (r.studentId) return mine.some((s) => s.id === r.studentId) || STAFFY.includes(u.role); if (r.staffId) return r.staffId === u.id || ['ADMIN', 'SUPER_ADMIN'].includes(u.role); return true; });
    return this.hydrate(centreId, ok);
  }
  /** Staff: my duties / tasks. */
  @Get('mine/duties') @Roles(...STAFFY) async myDuties(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const rows = await this.dbs.db.select().from(records).where(and(eq(records.centreId, centreOf(u, c)), eq(records.kind, 'duty'), eq(records.staffId, u.id))).orderBy(desc(records.createdAt)); return this.hydrate(centreOf(u, c), rows); }

  /** Staff: apply for leave from the app. */
  @Post('my-leave') @Roles(...STAFFY) async myLeave(@CurrentUser() u: JwtUser, @Body() b: { fromDate: string; toDate?: string; type?: string; reason: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); if (!b.fromDate || !b.reason?.trim()) throw new BadRequestException('Dates and reason are required'); const to = b.toDate || b.fromDate; const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(b.fromDate).getTime()) / 864e5) + 1);
    const [row] = await this.dbs.db.insert(records).values({ centreId, kind: 'staff-leave', staffId: u.id, title: b.reason.trim().slice(0, 200), date: b.fromDate, status: 'pending', data: JSON.stringify({ toDate: to, type: b.type || 'Casual', days }), createdBy: u.id }).returning();
    const admins = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN'))); this.notify.notifyUsers(centreId, admins.map((a) => a.id), `Leave request: ${u.name}`, `${b.fromDate}${to !== b.fromDate ? ' to ' + to : ''} · ${b.reason}`, { data: { type: 'record', id: row.id } }); return row;
  }
  @Get('mine/leaves') @Roles(...STAFFY) async myLeaves(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const rows = await this.dbs.db.select().from(records).where(and(eq(records.centreId, centreOf(u, c)), eq(records.kind, 'staff-leave'), eq(records.staffId, u.id))).orderBy(desc(records.createdAt)); return this.hydrate(centreOf(u, c), rows); }

  /** Teacher: publish own PTM slots. body: { date, times: ['10:00','10:10'], venue, mode, title } */
  @Post('my-ptm-slots') @Roles(...STAFFY) async myPtm(@CurrentUser() u: JwtUser, @Body() b: { date: string; times: string[]; venue?: string; mode?: string; title?: string; duration?: number; meetLink?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); if (!b.date || !b.times?.length) throw new BadRequestException('Date and at least one time are required'); let n = 0;
    for (const t of b.times.slice(0, 60)) { await this.dbs.db.insert(records).values({ centreId, kind: 'ptm-slot', staffId: u.id, title: b.title || `PTM with ${u.name}`, date: b.date, status: 'open', data: JSON.stringify({ time: t, duration: b.duration || 10, venue: b.venue || '', mode: b.mode || 'In person', meetLink: b.meetLink || '' }), parentVisible: true, createdBy: u.id }); n++; }
    return { created: n };
  }

  /** Student / parent: rate a teacher or give PTM feedback. */
  @Post('feedback/:kind') async feedback(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Body() b: { staffId?: string; studentId?: string; rating: number; comment?: string; subject?: string; anonymous?: boolean; teacher?: string }, @Query('centreId') c?: string) {
    if (!['teacher-feedback', 'ptm-feedback'].includes(k)) throw new BadRequestException('Unknown feedback kind'); if (!['STUDENT', 'PARENT'].includes(u.role)) throw new ForbiddenException('Only students and parents can give feedback');
    const centreId = centreOf(u, c); const mine = await myStudents(this.dbs.db, u, centreId); const studentId = b.studentId && mine.some((s) => s.id === b.studentId) ? b.studentId : mine[0]?.id || null; const rating = Math.min(5, Math.max(1, Number(b.rating) || 0)); if (!rating) throw new BadRequestException('Give a rating from 1 to 5');
    const [row] = await this.dbs.db.insert(records).values({ centreId, kind: k, studentId, staffId: b.staffId || null, title: k === 'teacher-feedback' ? `${rating}/5${b.subject ? ' · ' + b.subject : ''}` : `PTM · ${b.teacher || ''}`.trim(), date: new Date().toISOString().slice(0, 10), status: 'new', data: JSON.stringify({ rating, comment: b.comment || '', subject: b.subject || '', anonymous: b.anonymous === false ? 'No' : 'Yes', from: u.role.toLowerCase(), teacher: b.teacher || '' }), parentVisible: false, createdBy: u.id }).returning(); return { ok: true, id: row.id };
  }
  /** Owner: average rating per teacher. */
  @Get('teacher-feedback/summary') @Roles('SUPER_ADMIN', 'ADMIN') async tfSummary(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const rows = await this.dbs.db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'teacher-feedback'))); const us = await this.dbs.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.centreId, centreId)); const by: Record<string, any> = {};
    rows.forEach((r) => { const d = JSON.parse(r.data); const k = r.staffId || 'none'; by[k] = by[k] || { staffId: r.staffId, name: us.find((x) => x.id === r.staffId)?.name || 'General', count: 0, sum: 0, comments: [] as string[] }; by[k].count++; by[k].sum += Number(d.rating || 0); if (d.comment) by[k].comments.push(d.comment); });
    return Object.values(by).map((x: any) => ({ staffId: x.staffId, name: x.name, count: x.count, average: Math.round((x.sum / x.count) * 10) / 10, comments: x.comments.slice(0, 5) })).sort((a: any, b: any) => b.average - a.average);
  }
  /** Parent: book an open PTM slot for a child. */
  @Post('ptm/:id/book') async bookPtm(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { studentId?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const mine = await myStudents(db, u, centreId); const st = mine.find((s) => s.id === b.studentId) || mine[0]; if (!st) throw new ForbiddenException('No student linked to your account');
    const [slot] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'ptm-slot'))); if (!slot) throw new BadRequestException('Slot not found'); if (slot.status !== 'open') throw new BadRequestException('This slot is already booked');
    const [ok] = await db.update(records).set({ status: 'booked', studentId: st.id, data: JSON.stringify({ ...JSON.parse(slot.data), bookedBy: u.name }), updatedAt: new Date() }).where(and(eq(records.id, id), eq(records.status, 'open'))).returning(); if (!ok) throw new BadRequestException('This slot was just booked by someone else');
    if (slot.staffId) this.notify.notifyUsers(centreId, [slot.staffId], `PTM booked: ${st.name}`, `${slot.date || ''} ${JSON.parse(slot.data).time || ''}`, { data: { type: 'record', id } }); return { ok: true };
  }

  /** Parent / student: raise a service request (certificate copy, bus change, repair...). */
  @Post('request') async request(@CurrentUser() u: JwtUser, @Body() b: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const mine = ['STUDENT', 'PARENT'].includes(u.role) ? await myStudents(this.dbs.db, u, centreId) : [];
    const studentId = b.studentId && mine.some((s) => s.id === b.studentId) ? b.studentId : mine[0]?.id || null;
    const [row] = await this.dbs.db.insert(records).values({ centreId, kind: 'service-request', studentId, title: String(b.title || 'Request').slice(0, 200), date: new Date().toISOString().slice(0, 10), status: 'open', data: JSON.stringify({ type: b.data?.type || 'Other', details: b.data?.details || '', from: u.role.toLowerCase() }), parentVisible: true, createdBy: u.id }).returning();
    const admins = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN')));
    this.notify.notifyUsers(centreId, admins.map((a) => a.id), `Service request: ${row.title}`, b.data?.details || '', { data: { type: 'record', id: row.id } });
    return row;
  }

  @Post(':kind') @Roles(...STAFFY) async create(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Body() b: any, @Query('centreId') c?: string) {
    const kd = await this.allowed(u, k); const centreId = centreOf(u, c); const db = this.dbs.db;
    const title = String(b.title || '').trim(); if (!title && kd.titleLabel.indexOf('optional') < 0) throw new BadRequestException(`${kd.titleLabel} is required`);
    for (const f of kd.fields) if (f.required && !b.data?.[f.key]) throw new BadRequestException(`${f.label} is required`);
    if (kd.about === 'student' && b.studentId) { const [st] = await db.select({ id: students.id }).from(students).where(and(eq(students.id, b.studentId), eq(students.centreId, centreId))); if (!st) throw new BadRequestException('Student not found'); }
    const status = b.status && kd.statuses.includes(b.status) ? b.status : kd.statuses[0];
    const [row] = await db.insert(records).values({ centreId, kind: k, studentId: b.studentId || null, staffId: b.staffId || null, refId: b.refId || null, title: title || kd.label, date: b.date || null, status, data: JSON.stringify(b.data || {}), parentVisible: b.parentVisible ?? !!kd.parentVisible, createdBy: u.id }).returning();
    if (b.notifyParent && row.studentId) await this.tellParent(centreId, row.studentId, `${kd.label}: ${row.title}`, b.notifyText || this.summary(kd, row));
    if (k === 'duty' && row.staffId) this.notify.notifyUsers(centreId, [row.staffId], `New duty: ${row.title}`, (b.data?.dueDate ? `Due ${b.data.dueDate}. ` : '') + (b.data?.details || ''), { data: { type: 'duty', id: row.id } });
    if (k === 'event' && b.notifyAll) { const aud = await this.notify.audienceForBatch(centreId, null); this.notify.notifyUsers(centreId, aud, `Event: ${row.title}`, `${row.date || ''} ${b.data?.time || ''} ${b.data?.venue ? '· ' + b.data.venue : ''}`.trim(), { data: { type: 'event', id: row.id } }); }
    if (k === 'holiday' && b.notifyAll) { const aud = await this.notify.audienceForBatch(centreId, null); this.notify.notifyUsers(centreId, aud, `${status === 'holiday' ? 'Holiday' : 'Calendar'}: ${row.title}`, `${row.date || ''}${b.data?.endDate ? ' to ' + b.data.endDate : ''}`, { data: { type: 'holiday', id: row.id } }); }
    if (k === 'stock-move' && row.refId) await this.adjustStock(centreId, row.refId, status === 'in' ? Number(b.data?.qty || 0) : -Number(b.data?.qty || 0));
    return (await this.hydrate(centreId, [row]))[0];
  }

  @Put(':kind/:id') @Roles(...STAFFY) async update(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Param('id') id: string, @Body() b: any, @Query('centreId') c?: string) {
    const kd = k === 'duty' ? this.kind(k) : await this.allowed(u, k); const centreId = centreOf(u, c); const db = this.dbs.db;
    const [old] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, k))); if (!old) throw new BadRequestException('Not found');
    if (k === 'duty' && old.staffId === u.id && !['ADMIN', 'SUPER_ADMIN'].includes(u.role)) { const [row] = await db.update(records).set({ status: b.status === 'done' ? 'done' : old.status, data: b.data?.remarks ? JSON.stringify({ ...JSON.parse(old.data), remarks: b.data.remarks }) : old.data, updatedAt: new Date() }).where(eq(records.id, id)).returning(); return (await this.hydrate(centreId, [row]))[0]; }
    const set: any = { updatedAt: new Date() }; if (b.title !== undefined) set.title = b.title; if (b.date !== undefined) set.date = b.date || null; if (b.status && kd.statuses.includes(b.status)) set.status = b.status; if (b.data) set.data = JSON.stringify({ ...JSON.parse(old.data), ...b.data }); if (b.parentVisible !== undefined) set.parentVisible = !!b.parentVisible; if (b.studentId !== undefined) set.studentId = b.studentId || null; if (b.staffId !== undefined) set.staffId = b.staffId || null; if (b.refId !== undefined) set.refId = b.refId || null;
    const [row] = await db.update(records).set(set).where(eq(records.id, id)).returning();
    if (b.notifyParent && row.studentId) await this.tellParent(centreId, row.studentId, `${kd.label}: ${row.title}`, b.notifyText || this.summary(kd, row));
    if (k === 'admission' && b.status && b.status !== old.status && b.status !== 'admitted') { const d = JSON.parse(row.data || '{}'); const [ce] = await db.select({ name: centres.name }).from(centres).where(eq(centres.id, centreId)); const extra = [d.interviewDate && b.status === 'interview' ? `Date: ${d.interviewDate}${d.interviewTime ? ' ' + d.interviewTime : ''}.` : '', d.publicRemark || ''].filter(Boolean).join(' '); this.msg.contact(centreId, { mobile: d.parentMobile, email: d.parentEmail }, `Admission update — ${ce?.name || 'School'}`, `${row.title}: ${STAGE_LABEL[b.status] || b.status}. ${extra}`.trim(), 'admission').catch(() => {}); }
    if (k === 'loan' && b.status === 'returned' && old.status !== 'returned' && row.refId) await this.adjustStock(centreId, row.refId, 0);
    return (await this.hydrate(centreId, [row]))[0];
  }

  @Delete(':kind/:id') @Roles('SUPER_ADMIN', 'ADMIN') async remove(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Param('id') id: string, @Query('centreId') c?: string) { await this.allowed(u, k); await this.dbs.db.delete(records).where(and(eq(records.id, id), eq(records.centreId, centreOf(u, c)))); return { ok: true }; }

  /** CSV export of a kind. */
  @Get(':kind/export.csv') @Roles('SUPER_ADMIN', 'ADMIN') /* data export: owner only, never staff */ async csv(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Res() res: any, @Query('centreId') c?: string) {
    const kd = await this.allowed(u, k); const rows = await this.list(u, k, undefined, undefined, undefined, undefined, c);
    const head = ['Date', kd.titleLabel, 'Status', kd.about === 'student' ? 'Student' : kd.about === 'staff' ? 'Staff' : '', kd.ref ? kd.ref.label : '', ...kd.fields.map((f) => f.label)].filter(Boolean);
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(','), ...rows.map((r: any) => [r.date || '', r.title, r.status, kd.about === 'student' ? r.studentName || '' : kd.about === 'staff' ? r.staffName || '' : null, kd.ref ? r.refTitle || '' : null, ...kd.fields.map((f) => r.data[f.key] ?? '')].filter((v) => v !== null).map(esc).join(','))];
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="${k}.csv"`); res.end(lines.join('\n'));
  }

  // ---- helpers ----
  private summary(kd: any, row: any) { const d = JSON.parse(row.data || '{}'); return [row.date, d.category || d.type || d.area, d.details || d.description || ''].filter(Boolean).join(' · ').slice(0, 200); }
  private async tellParent(centreId: string, studentId: string, title: string, body: string) {
    const [st] = await this.dbs.db.select().from(students).where(eq(students.id, studentId)); if (!st) return;
    const [p] = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT'))); if (p) this.notify.notifyUsers(centreId, [p.id], title, body, { data: { type: 'record', studentId } });
  }
  private async adjustStock(centreId: string, itemId: string, delta: number) {
    const [it] = await this.dbs.db.select().from(records).where(and(eq(records.id, itemId), eq(records.centreId, centreId))); if (!it) return; const d = JSON.parse(it.data || '{}'); const qty = Math.max(0, Number(d.qty || 0) + delta); const min = Number(d.minQty || 0);
    await this.dbs.db.update(records).set({ data: JSON.stringify({ ...d, qty }), status: qty === 0 ? 'out' : min && qty <= min ? 'low' : 'in-stock', updatedAt: new Date() }).where(eq(records.id, itemId));
  }
  private async hydrate(centreId: string, rows: any[]) {
    const db = this.dbs.db; const sids = [...new Set(rows.map((r) => r.studentId).filter(Boolean))]; const uids = [...new Set(rows.map((r) => r.staffId).filter(Boolean))]; const rids = [...new Set(rows.map((r) => r.refId).filter(Boolean))];
    const sts = sids.length ? await db.select({ id: students.id, name: students.name, rollNo: students.rollNo, batchId: students.batchId }).from(students).where(inArray(students.id, sids)) : [];
    const us = uids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, uids)) : [];
    const refs = rids.length ? await db.select({ id: records.id, title: records.title }).from(records).where(inArray(records.id, rids)) : [];
    return rows.map((r) => { const st = sts.find((s) => s.id === r.studentId); return { ...r, data: JSON.parse(r.data || '{}'), studentName: st?.name, rollNo: st?.rollNo, batchId: st?.batchId, staffName: us.find((x) => x.id === r.staffId)?.name, refTitle: refs.find((x) => x.id === r.refId)?.title, kindLabel: KINDS[r.kind]?.label }; });
  }
}
