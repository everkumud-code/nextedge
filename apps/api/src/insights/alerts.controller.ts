import { Controller, Get, Query } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, centres, centreSettings, enquiries, exams, leaveRequests, loginLog, records, staffPermissions, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { FeesController } from '../fees/fees.controller';

type Alert = { key: string; label: string; count: number; severity: 'high' | 'medium' | 'info'; path: string; module: string; hint?: string; sample: string[] };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** The alert centre: what needs the owner's attention right now, across modules. Staff only see alerts for modules they may use. */
@Controller('alerts')
@Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
export class AlertsController {
  constructor(private dbs: DbService, private fees: FeesController) {}

  @Get() async alerts(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const ist = new Date(Date.now() + 5.5 * 3600e3); const today = ymd(ist); const in7 = ymd(new Date(ist.getTime() + 7 * 864e5)); const ago7 = ymd(new Date(ist.getTime() - 6 * 864e5));
    const out: Alert[] = []; const add = (a: Omit<Alert, 'sample'> & { sample?: string[] }) => { if (a.count > 0) out.push({ ...a, sample: a.sample || [] }); };
    const safe = async (f: () => Promise<void>) => { try { await f(); } catch { /* one failing check must not hide the rest */ } };
    const recs = async (kind: string, status?: string) => db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, kind), status ? eq(records.status, status) : undefined));
    const names = async (ids: string[]) => (ids.length ? db.select({ id: students.id, name: students.name }).from(students).where(inArray(students.id, ids)) : []);

    await safe(async () => { const d = await this.fees.defaulters(u, centreId); add({ key: 'fees-due', label: 'Students with fee dues', count: d.length, severity: 'high', path: '/fees', module: 'fees', hint: `₹${Math.round(d.reduce((a, r) => a + r.balance, 0)).toLocaleString('en-IN')} outstanding`, sample: d.slice(0, 5).map((r: any) => `${r.name} — ₹${Math.round(r.balance)}`) }); });
    await safe(async () => { const rows = await db.select({ id: attendance.studentId }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.date, today), eq(attendance.status, 'ABSENT'))); const n = await names(rows.map((r) => r.id)); add({ key: 'absent-today', label: 'Students absent today', count: rows.length, severity: 'medium', path: '/attendance', module: 'attendance', sample: n.slice(0, 5).map((x) => x.name) }); });
    await safe(async () => { const rows = await db.select({ id: attendance.studentId, n: sql<number>`count(*)` }).from(attendance).where(and(eq(attendance.centreId, centreId), gte(attendance.date, ago7), lte(attendance.date, today), eq(attendance.status, 'ABSENT'))).groupBy(attendance.studentId); const bad = rows.filter((r) => Number(r.n) >= 3); const n = await names(bad.map((r) => r.id)); add({ key: 'chronic-absent', label: 'Absent 3+ days this week', count: bad.length, severity: 'high', path: '/attendance', module: 'attendance', hint: 'Call the parents', sample: n.slice(0, 5).map((x) => x.name) }); });
    await safe(async () => { const rows = await db.select().from(leaveRequests).where(and(eq(leaveRequests.centreId, centreId), eq(leaveRequests.status, 'pending'))); add({ key: 'student-leave', label: 'Student leave requests waiting', count: rows.length, severity: 'medium', path: '/inbox', module: 'leaves' }); });
    await safe(async () => { const r = await recs('staff-leave', 'pending'); add({ key: 'staff-leave', label: 'Staff leave waiting for approval', count: r.length, severity: 'medium', path: '/records/staff-leave', module: 'hr', sample: r.slice(0, 5).map((x) => x.title) }); });
    await safe(async () => { const r = await recs('admission'); const n = r.filter((x) => ['new', 'documents-pending'].includes(x.status)); add({ key: 'admissions', label: 'Admission applications to process', count: n.length, severity: 'high', path: '/records/admission', module: 'admissions', sample: n.slice(0, 5).map((x) => x.title) }); });
    await safe(async () => { const rows = await db.select().from(enquiries).where(and(eq(enquiries.centreId, centreId), lte(enquiries.nextFollowUp, today), inArray(enquiries.status, ['new', 'contacted', 'demo']))); add({ key: 'followups', label: 'Enquiry follow-ups due', count: rows.length, severity: 'high', path: '/enquiries', module: 'enquiries', sample: rows.slice(0, 5).map((x) => `${x.name} · ${x.mobile}`) }); });
    await safe(async () => { const r = (await recs('service-request')).filter((x) => ['open', 'in-progress'].includes(x.status)); add({ key: 'requests', label: 'Open service requests', count: r.length, severity: 'medium', path: '/records/service-request', module: 'visitors', sample: r.slice(0, 5).map((x) => x.title) }); });
    await safe(async () => { const r = (await recs('duty')).filter((x) => x.status !== 'done' && (JSON.parse(x.data).dueDate || '9999') < today); add({ key: 'duties', label: 'Overdue duties / tasks', count: r.length, severity: 'medium', path: '/records/duty', module: 'duties', sample: r.slice(0, 5).map((x) => x.title) }); });
    await safe(async () => { const r = (await recs('loan')).filter((x) => x.status === 'issued' && (JSON.parse(x.data).dueDate || '9999') < today); add({ key: 'library', label: 'Library books overdue', count: r.length, severity: 'info', path: '/records/loan', module: 'library', sample: r.slice(0, 5).map((x) => x.title || 'Book loan') }); });
    await safe(async () => { const r = (await recs('item')).filter((x) => { const d = JSON.parse(x.data); return x.status === 'out' || (d.minQty !== undefined && d.minQty !== '' && Number(d.qty) <= Number(d.minQty)); }); add({ key: 'stock', label: 'Inventory items low or out of stock', count: r.length, severity: 'info', path: '/records/item', module: 'inventory', sample: r.slice(0, 5).map((x) => x.title) }); });
    await safe(async () => { const rows = await db.select().from(exams).where(and(eq(exams.centreId, centreId), eq(exams.published, false), lte(exams.date, today))); add({ key: 'exams', label: 'Exams held but results not published', count: rows.length, severity: 'medium', path: '/exams', module: 'exams', sample: rows.slice(0, 5).map((x) => x.name) }); });
    await safe(async () => { const r = (await recs('event')).filter((x) => x.date && x.date >= today && x.date <= in7); add({ key: 'events', label: 'Events in the next 7 days', count: r.length, severity: 'info', path: '/records/event', module: 'events', sample: r.slice(0, 5).map((x) => `${x.title} · ${x.date}`) }); });
    await safe(async () => { const r = (await recs('scheduled-service')).filter((x) => x.status !== 'done' && JSON.parse(x.data).nextDue && JSON.parse(x.data).nextDue <= in7); add({ key: 'services', label: 'Scheduled services due this week', count: r.length, severity: 'medium', path: '/records/scheduled-service', module: 'inventory', sample: r.slice(0, 5).map((x) => x.title) }); });
    await safe(async () => { const r = (await recs('behaviour')).filter((x) => ['recorded', 'intervention'].includes(x.status) && JSON.parse(x.data).followUpOn && JSON.parse(x.data).followUpOn <= today); const n = await names(r.map((x) => x.studentId!).filter(Boolean)); add({ key: 'behaviour', label: 'Behaviour follow-ups due', count: r.length, severity: 'medium', path: '/records/behaviour', module: 'discipline', sample: n.slice(0, 5).map((x) => x.name) }); });
    await safe(async () => { const st = await db.select({ id: students.id }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true), sql`(${students.parentMobile} is null or length(${students.parentMobile}) < 10)`)); add({ key: 'no-mobile', label: 'Students without a valid parent mobile', count: st.length, severity: 'info', path: '/students', module: 'students', hint: 'Parents cannot get messages or log in' }); });
    await safe(async () => { if (!['ADMIN', 'SUPER_ADMIN'].includes(u.role)) return; const s = (await db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId)))[0]; const end = s?.status === 'trial' ? s.trialEndsAt : s?.paidUntil; if (end && end <= in7) add({ key: 'subscription', label: s.status === 'trial' ? 'Free trial ending' : 'Subscription renewal due', count: 1, severity: 'high', path: '/subscription', module: '', hint: `Ends ${end}` }); });
    await safe(async () => { if (!['ADMIN', 'SUPER_ADMIN'].includes(u.role)) return; const f = await db.select({ id: loginLog.id }).from(loginLog).where(and(eq(loginLog.centreId, centreId), eq(loginLog.ok, false), gte(loginLog.at, new Date(Date.now() - 864e5)))); add({ key: 'failed-logins', label: 'Failed login attempts in 24 hours', count: f.length, severity: 'info', path: '/access', module: '', hint: 'Open Access & security' }); });

    const mods = u.modules || []; const full = ['ADMIN', 'SUPER_ADMIN'].includes(u.role);
    const list = out.filter((a) => full || !a.module || mods.includes(a.module)).sort((a, b) => ({ high: 0, medium: 1, info: 2 }[a.severity] - { high: 0, medium: 1, info: 2 }[b.severity]));
    return { date: today, total: list.reduce((a, x) => a + (x.severity === 'info' ? 0 : x.count), 0), high: list.filter((a) => a.severity === 'high').length, alerts: list };
  }
}

/** Access management: who logged in, from where, failed attempts, and every account with its last login. */
@Controller('access')
@Roles('SUPER_ADMIN', 'ADMIN')
export class AccessController {
  constructor(private dbs: DbService) {}
  @Get('overview') async overview(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const logs = await db.select().from(loginLog).where(eq(loginLog.centreId, centreId)).orderBy(desc(loginLog.at)).limit(300);
    const us = await db.select({ id: users.id, name: users.name, role: users.role, email: users.email, mobile: users.mobile, active: staffPermissions.active, title: staffPermissions.title, modules: staffPermissions.modules }).from(users).leftJoin(staffPermissions, eq(staffPermissions.userId, users.id)).where(and(eq(users.centreId, centreId), ne(users.role, 'STUDENT')));
    const last = new Map<string, Date>(); for (const l of logs) if (l.ok && l.userId && !last.has(l.userId)) last.set(l.userId, l.at);
    const day = Date.now() - 864e5;
    return { failed24h: logs.filter((l) => !l.ok && l.at.getTime() > day).length, logins24h: logs.filter((l) => l.ok && l.at.getTime() > day).length,
      accounts: us.map((x) => ({ id: x.id, name: x.name, role: x.role, email: x.email, mobile: x.mobile, title: x.title, active: x.active !== false, modules: x.modules ? (JSON.parse(x.modules) as string[]).length : null, lastLogin: last.get(x.id) || null })).sort((a, b) => (b.lastLogin?.getTime() || 0) - (a.lastLogin?.getTime() || 0)),
      logins: logs.slice(0, 150).map((l) => ({ id: l.id, at: l.at, name: l.name, role: l.role, ok: l.ok, channel: l.channel, note: l.note, ip: l.ip, device: l.device })) };
  }
}
