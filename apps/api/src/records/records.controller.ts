import { Body, Controller, Delete, Get, Param, Post, Put, Query, BadRequestException, ForbiddenException, Res } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { records, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';
import { KINDS, RECORD_MODULES } from './kinds';

const STAFFY = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'];
/** One controller for every record kind. Module access is checked per kind (feature flag + staff privilege). */
@Controller('records')
export class RecordsController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService) {}

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
    const ok = rows.filter((r) => { const kd = KINDS[r.kind]; if (!kd) return false; if (r.studentId) return mine.some((s) => s.id === r.studentId) || STAFFY.includes(u.role); if (r.staffId) return r.staffId === u.id || ['ADMIN', 'SUPER_ADMIN'].includes(u.role); return true; });
    return this.hydrate(centreId, ok);
  }
  /** Staff: my duties / tasks. */
  @Get('mine/duties') @Roles(...STAFFY) async myDuties(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const rows = await this.dbs.db.select().from(records).where(and(eq(records.centreId, centreOf(u, c)), eq(records.kind, 'duty'), eq(records.staffId, u.id))).orderBy(desc(records.createdAt)); return this.hydrate(centreOf(u, c), rows); }

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
    if (k === 'loan' && b.status === 'returned' && old.status !== 'returned' && row.refId) await this.adjustStock(centreId, row.refId, 0);
    return (await this.hydrate(centreId, [row]))[0];
  }

  @Delete(':kind/:id') @Roles('SUPER_ADMIN', 'ADMIN') async remove(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Param('id') id: string, @Query('centreId') c?: string) { await this.allowed(u, k); await this.dbs.db.delete(records).where(and(eq(records.id, id), eq(records.centreId, centreOf(u, c)))); return { ok: true }; }

  /** CSV export of a kind. */
  @Get(':kind/export.csv') @Roles(...STAFFY) async csv(@CurrentUser() u: JwtUser, @Param('kind') k: string, @Res() res: any, @Query('centreId') c?: string) {
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
