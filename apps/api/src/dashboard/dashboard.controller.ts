import { Controller, Get, Query } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, enquiries, examMarks, exams, facultyBatches, feePayments, homework, homeworkSubmissions, houseRoles, housePoints, houses, leaveRequests, liveClasses, notices, records, staffAttendance, staffPermissions, students, substitutions, timetableSlots, users } from '../db/schema';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { FeesController } from '../fees/fees.controller';
import { dashKind, pct, presentStreak } from './dash-kind';

const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
const J = (s: string | null | undefined) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const lastDay = (ym: string) => `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } }; // one broken card must never blank the whole home screen

/** The first screen after login, written for each kind of person: student, parent, teacher, driver, front office, HR, accounts and other staff. */
@Controller('dashboard')
export class DashboardController {
  constructor(private dbs: DbService, private fees: FeesController) {}

  @Get('home') async home(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const db = this.dbs.db; let centreId: string; try { centreId = centreOf(u, c); } catch { return { kind: 'admin' }; } if (!centreId) return { kind: 'admin' };
    let title: string | null = null; if (u.role === 'STAFF' || u.role === 'FACULTY') { const [p] = await db.select({ t: staffPermissions.title }).from(staffPermissions).where(eq(staffPermissions.userId, u.id)); title = p?.t || null; }
    const kind = dashKind(u.role, title); const ctx = { centreId, today: istNow().toISOString().slice(0, 10), title };
    const [me] = await db.select({ name: users.name, mobile: users.mobile }).from(users).where(eq(users.id, u.id));
    const base = { kind, name: me?.name || u.name, title };
    if (kind === 'admin') return base;
    if (kind === 'student' || kind === 'parent') return { ...base, ...(await this.family(u, ctx)) };
    if (kind === 'teacher') return { ...base, ...(await this.teacher(u, ctx)) };
    if (kind === 'driver') return { ...base, ...(await this.driver(u, ctx, me)) };
    if (kind === 'frontoffice') return { ...base, ...(await this.frontOffice(ctx)) };
    if (kind === 'hr') return { ...base, ...(await this.hr(ctx)) };
    if (kind === 'accounts') return { ...base, ...(await this.accounts(u, ctx)) };
    return { ...base, ...(await this.otherStaff(u, ctx)) };
  }

  // ---------- shared pieces ----------
  private notices(centreId: string, batchIds: string[] | null) {
    const where = batchIds ? and(eq(notices.centreId, centreId), or(isNull(notices.batchId), batchIds.length ? inArray(notices.batchId, batchIds) : sql`false`)) : eq(notices.centreId, centreId);
    return this.dbs.db.select({ id: notices.id, title: notices.title, body: notices.body, createdAt: notices.publishedAt, type: notices.type, pinned: notices.pinned }).from(notices).where(where).orderBy(desc(notices.pinned), desc(notices.publishedAt)).limit(4);
  }
  /** A staff member's own attendance this month. */
  private async myMonth(userId: string, centreId: string, today: string) {
    const rows = await this.dbs.db.select({ status: staffAttendance.status, date: staffAttendance.date }).from(staffAttendance).where(and(eq(staffAttendance.centreId, centreId), eq(staffAttendance.userId, userId), gte(staffAttendance.date, today.slice(0, 7) + '-01')));
    const n = (s: string[]) => rows.filter((r) => s.includes(r.status)).length;
    return { present: n(['present', 'manual']), late: n(['late']), halfDay: n(['half-day']), absent: n(['absent']), leave: n(['leave']), marked: rows.length, todayStatus: rows.find((r) => r.date === today)?.status || null };
  }
  private async myDuties(userId: string, centreId: string) {
    const rows = await this.dbs.db.select({ id: records.id, title: records.title, status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'duty'), eq(records.staffId, userId), inArray(records.status, ['assigned', 'in-progress', 'overdue']))).orderBy(records.date).limit(6);
    return rows.map((r) => { const d = J(r.data); return { id: r.id, title: r.title, status: r.status, dueDate: d.dueDate || null, priority: d.priority || 'Normal' }; });
  }

  // ---------- student and parent ----------
  private async family(u: JwtUser, ctx: { centreId: string; today: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx; const kids = await myStudents(db, u, centreId);
    const ledger = await safe(() => this.fees.ledger(u, centreId), [] as any[]);
    const allHouses = await db.select().from(houses).where(eq(houses.centreId, centreId));
    const hp = allHouses.length ? await db.select({ houseId: housePoints.houseId, p: sql<number>`coalesce(sum(${housePoints.points}), 0)` }).from(housePoints).where(eq(housePoints.centreId, centreId)).groupBy(housePoints.houseId) : [];
    const children = [];
    for (const st of kids) children.push(await this.child(st, centreId, today, ledger.find((l: any) => l.studentId === st.id), allHouses, hp));
    const bids = [...new Set(kids.map((k) => k.batchId).filter((x): x is string => !!x))];
    return { children, notices: await safe(() => this.notices(centreId, bids), []) };
  }
  private async child(st: typeof students.$inferSelect, centreId: string, today: string, fee: any, allHouses: (typeof houses.$inferSelect)[], hp: { houseId: string; p: number }[]) {
    const db = this.dbs.db; const wd = new Date(today + 'T00:00:00Z').getUTCDay(); const month = today.slice(0, 7);
    const [batch] = st.batchId ? await db.select({ name: batches.name, className: batches.className, section: batches.section }).from(batches).where(eq(batches.id, st.batchId)) : [];
    const days = await safe(() => db.select({ date: attendance.date, status: attendance.status }).from(attendance).where(and(eq(attendance.studentId, st.id), gte(attendance.date, addDays(today, -89)))).orderBy(attendance.date), [] as any[]);
    const thisMonth = days.filter((d: any) => String(d.date).startsWith(month)); const cnt = (a: any[], s: string[]) => a.filter((d) => s.includes(d.status)).length;
    const attendanceInfo = { monthPct: pct(cnt(thisMonth, ['PRESENT', 'LATE']), thisMonth.filter((d: any) => d.status !== 'LEAVE').length), present: cnt(thisMonth, ['PRESENT']), late: cnt(thisMonth, ['LATE']), absent: cnt(thisMonth, ['ABSENT']), leave: cnt(thisMonth, ['LEAVE']), overallPct: pct(cnt(days, ['PRESENT', 'LATE']), days.filter((d: any) => d.status !== 'LEAVE').length), streak: presentStreak(days as any), strip: (days as any[]).slice(-21).map((d) => ({ date: d.date, status: d.status })) };
    const periods = st.batchId ? await safe(() => db.select({ start: timetableSlots.startTime, end: timetableSlots.endTime, subject: timetableSlots.subject, room: timetableSlots.room, teacher: users.name, period: timetableSlots.period }).from(timetableSlots).leftJoin(users, eq(users.id, timetableSlots.facultyId)).where(and(eq(timetableSlots.batchId, st.batchId!), eq(timetableSlots.weekday, wd))).orderBy(timetableSlots.startTime).then((r) => (r.some((x) => x.period !== null) ? r.filter((x) => x.period !== null) : r)), [] as any[]) : []; // a class that has period-grid slots shows only those
    const hw = st.batchId ? await safe(async () => { const rows = await db.select({ id: homework.id, title: homework.title, subject: homework.subject, dueAt: homework.dueAt }).from(homework).where(and(eq(homework.batchId, st.batchId!), gte(homework.dueAt, new Date(Date.now() - 7 * 864e5)))).orderBy(homework.dueAt).limit(8); const subs = rows.length ? await db.select({ id: homeworkSubmissions.homeworkId }).from(homeworkSubmissions).where(and(eq(homeworkSubmissions.studentId, st.id), inArray(homeworkSubmissions.homeworkId, rows.map((r) => r.id)))) : []; const done = new Set(subs.map((s) => s.id)); return rows.map((r) => ({ ...r, done: done.has(r.id), overdue: !done.has(r.id) && r.dueAt.toISOString().slice(0, 10) < today })); }, [] as any[]) : [];
    const exam = st.batchId ? await safe(async () => {
      const ex = await db.select().from(exams).where(eq(exams.batchId, st.batchId!)).orderBy(desc(exams.date)).limit(12); const upcoming = ex.filter((e) => e.date && e.date >= today).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 3).map((e) => ({ id: e.id, name: e.name, date: e.date }));
      const past = ex.filter((e) => e.published && (!e.date || e.date <= today)).slice(0, 6).reverse(); const marks = past.length ? await db.select().from(examMarks).where(and(eq(examMarks.studentId, st.id), inArray(examMarks.examId, past.map((e) => e.id)))) : [];
      const results = past.map((e) => { const sub: { name: string; max: number }[] = J(e.subjects) as any; const mine = marks.filter((m) => m.examId === e.id && !m.absent && m.marks !== null); const got = mine.reduce((a, m) => a + Number(m.marks), 0); const max = mine.reduce((a, m) => a + Number((Array.isArray(sub) ? sub : []).find((s) => s.name === m.subject)?.max || 0), 0); return { name: e.name, pct: pct(got, max) }; }).filter((r) => r.pct !== null);
      return { upcoming, results };
    }, { upcoming: [], results: [] } as any) : { upcoming: [], results: [] };
    const loans = await safe(async () => { const rows = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'loan'), eq(records.studentId, st.id), inArray(records.status, ['issued', 'overdue']))); const bk = rows.length ? await db.select({ id: records.id, title: records.title }).from(records).where(inArray(records.id, rows.map((r) => r.refId).filter((x): x is string => !!x))) : []; return rows.map((r) => { const due = J(r.data).dueDate; return { book: bk.find((b) => b.id === r.refId)?.title || 'Book', dueDate: due, overdue: !!due && due < today }; }); }, [] as any[]);
    const wins = await safe(() => db.select({ title: records.title, date: records.date, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'achievement'), eq(records.studentId, st.id))).orderBy(desc(records.date)).limit(4).then((r) => r.map((x) => ({ title: x.title, date: x.date, position: J(x.data).position || '', area: J(x.data).area || '' }))), [] as any[]);
    const bus = await safe(async () => { const [a] = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'transport-assign'), eq(records.studentId, st.id), eq(records.status, 'active'))).limit(1); if (!a) return null; const [rt] = a.refId ? await db.select({ title: records.title, data: records.data }).from(records).where(eq(records.id, a.refId)) : []; const d = J(a.data); return { route: rt?.title || '', stop: a.title, pickup: d.pickupTime || '', drop: d.dropTime || '', vehicle: J(rt?.data).vehicle || '', driver: J(rt?.data).driver || '' }; }, null as any);
    let house: any = null; const h = allHouses.find((x) => x.id === st.houseId); if (h) {
      const sums = allHouses.map((x) => ({ id: x.id, points: Number(hp.find((p) => p.houseId === x.id)?.p || 0) })); const mine = sums.find((s) => s.id === h.id)!; const rank = sums.filter((s) => s.points > mine.points).length + 1;
      const roles = await db.select({ title: houseRoles.title }).from(houseRoles).where(and(eq(houseRoles.houseId, h.id), eq(houseRoles.studentId, st.id)));
      const my = await db.select({ p: sql<number>`coalesce(sum(${housePoints.points}), 0)` }).from(housePoints).where(and(eq(housePoints.houseId, h.id), eq(housePoints.studentId, st.id)));
      const board = sums.map((s) => ({ name: allHouses.find((x) => x.id === s.id)!.name, colour: allHouses.find((x) => x.id === s.id)!.colour, points: s.points })).sort((a, b) => b.points - a.points);
      house = { name: h.name, colour: h.colour, motto: h.motto || '', points: mine.points, rank, of: allHouses.length, roles: roles.map((r) => r.title), myPoints: Number(my[0]?.p || 0), board };
    }
    let birthday: any = null; if (st.dob) { const mmdd = String(st.dob).slice(5); const y = Number(today.slice(0, 4)); let next = `${y}-${mmdd}`; if (next < today) next = `${y + 1}-${mmdd}`; birthday = { daysLeft: Math.round((Date.parse(next) - Date.parse(today)) / 864e5), age: Number(next.slice(0, 4)) - Number(String(st.dob).slice(0, 4)) }; }
    return { id: st.id, name: st.name, className: batch?.className || st.className || '', section: batch?.section || '', rollNo: st.rollNo, admissionNo: st.admissionNo, attendance: attendanceInfo, periods, homework: hw, exams: exam, fees: fee ? { due: fee.due, paid: fee.paid, balance: fee.balance, plan: fee.plan?.name || '' } : null, loans, achievements: wins, bus, house, birthday };
  }

  // ---------- teacher ----------
  private async teacher(u: JwtUser, ctx: { centreId: string; today: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx; const wd = new Date(today + 'T00:00:00Z').getUTCDay();
    const periods = await safe(async () => {
      const own = await db.select({ start: timetableSlots.startTime, end: timetableSlots.endTime, subject: timetableSlots.subject, room: timetableSlots.room, batch: batches.name, batchId: batches.id, slotId: timetableSlots.id, period: timetableSlots.period }).from(timetableSlots).innerJoin(batches, eq(batches.id, timetableSlots.batchId)).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.facultyId, u.id), eq(timetableSlots.weekday, wd))).then((r) => { const grid = new Set(r.filter((x) => x.period !== null).map((x) => x.batchId)); return r.filter((x) => x.period !== null || !grid.has(x.batchId)); });
      const subs = await db.select({ start: substitutions.startTime, end: substitutions.endTime, subject: substitutions.subject, batch: batches.name, batchId: batches.id, slotId: substitutions.slotId, orig: substitutions.originalFacultyId }).from(substitutions).innerJoin(batches, eq(batches.id, substitutions.batchId)).where(and(eq(substitutions.centreId, centreId), eq(substitutions.date, today), eq(substitutions.substituteFacultyId, u.id)));
      const away = await db.select({ slotId: substitutions.slotId }).from(substitutions).where(and(eq(substitutions.centreId, centreId), eq(substitutions.date, today), eq(substitutions.originalFacultyId, u.id)));
      const gone = new Set(away.map((a) => a.slotId)); return [...own.filter((p) => !gone.has(p.slotId)).map((p) => ({ ...p, substitute: false })), ...subs.map((p) => ({ ...p, room: null, substitute: true }))].sort((a, b) => a.start.localeCompare(b.start));
    }, [] as any[]);
    const classes = await safe(async () => { const rows = await db.select({ id: batches.id, name: batches.name, subject: facultyBatches.subject }).from(facultyBatches).innerJoin(batches, eq(batches.id, facultyBatches.batchId)).where(and(eq(facultyBatches.centreId, centreId), eq(facultyBatches.facultyId, u.id))); const owned = await db.select({ id: batches.id, name: batches.name }).from(batches).where(and(eq(batches.centreId, centreId), eq(batches.classTeacherId, u.id))); const all = [...rows.map((r) => ({ ...r, classTeacher: false })), ...owned.filter((o) => !rows.some((r) => r.id === o.id)).map((o) => ({ ...o, subject: null, classTeacher: true }))].map((r) => ({ ...r, classTeacher: r.classTeacher || owned.some((o) => o.id === r.id) })); const n = all.length ? await db.select({ batchId: students.batchId, n: sql<number>`count(*)` }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true), inArray(students.batchId, all.map((a) => a.id)))).groupBy(students.batchId) : []; return all.map((a) => ({ ...a, strength: Number(n.find((x) => x.batchId === a.id)?.n || 0) })); }, [] as any[]);
    const marked = classes.length ? await safe(() => db.select({ batchId: attendance.batchId }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.date, today), inArray(attendance.batchId, classes.map((c: any) => c.id)))).groupBy(attendance.batchId), [] as any[]) : [];
    const attendanceDue = classes.filter((c: any) => c.classTeacher && !marked.some((m: any) => m.batchId === c.id)).map((c: any) => ({ id: c.id, name: c.name }));
    const toCheck = await safe(() => db.select({ n: sql<number>`count(*)` }).from(homeworkSubmissions).innerJoin(homework, eq(homework.id, homeworkSubmissions.homeworkId)).where(and(eq(homework.createdBy, u.id), isNull(homeworkSubmissions.checkedAt))).then((r) => Number(r[0]?.n || 0)), 0);
    const pendingLeaves = classes.some((c: any) => c.classTeacher) ? await safe(() => db.select({ n: sql<number>`count(*)` }).from(leaveRequests).innerJoin(students, eq(students.id, leaveRequests.studentId)).innerJoin(batches, eq(batches.id, students.batchId)).where(and(eq(leaveRequests.centreId, centreId), eq(leaveRequests.status, 'pending'), eq(batches.classTeacherId, u.id))).then((r) => Number(r[0]?.n || 0)), 0) : 0;
    const live = classes.length ? await safe(() => db.select({ id: liveClasses.id, title: liveClasses.title, startAt: liveClasses.startAt, status: liveClasses.status }).from(liveClasses).where(and(eq(liveClasses.centreId, centreId), inArray(liveClasses.batchId, classes.map((c: any) => c.id)), gte(liveClasses.startAt, new Date(today + 'T00:00:00+05:30')), lte(liveClasses.startAt, new Date(today + 'T23:59:59+05:30')))).orderBy(liveClasses.startAt), [] as any[]) : [];
    return { periods, classes, attendanceDue, toCheck, pendingLeaves, live, duties: await safe(() => this.myDuties(u.id, centreId), []), me: await safe(() => this.myMonth(u.id, centreId, today), null), notices: await safe(() => this.notices(centreId, null), []) };
  }

  // ---------- driver ----------
  private async driver(u: JwtUser, ctx: { centreId: string; today: string }, me?: { name: string; mobile: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx;
    const routes = await safe(async () => {
      const all = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'transport-route'))); const mob = String(me?.mobile || '').replace(/\D/g, '').slice(-10); const nm = String(me?.name || '').toLowerCase();
      const mine = all.filter((r) => { const d = J(r.data); return (mob && String(d.driverMobile || '').replace(/\D/g, '').slice(-10) === mob) || (nm && String(d.driver || '').toLowerCase() === nm); });
      const out = []; for (const r of mine) {
        const d = J(r.data); const assigns = await db.select({ stop: records.title, data: records.data, name: students.name, cls: students.className }).from(records).innerJoin(students, eq(students.id, records.studentId)).where(and(eq(records.centreId, centreId), eq(records.kind, 'transport-assign'), eq(records.refId, r.id), eq(records.status, 'active')));
        const stops = String(d.stops || '').split('\n').map((x) => x.trim()).filter(Boolean).map((line) => { const stop = line.split(' ')[0]; return { line, kids: assigns.filter((a) => a.stop === stop).map((a) => ({ name: a.name, cls: a.cls || '' })) }; });
        out.push({ id: r.id, title: r.title, vehicle: d.vehicle || '', helper: d.helper || '', capacity: Number(d.capacity || 0), students: assigns.length, stops });
      } return out;
    }, [] as any[]);
    return { routes, me: await safe(() => this.myMonth(u.id, centreId, today), null), duties: await safe(() => this.myDuties(u.id, centreId), []), notices: await safe(() => this.notices(centreId, null), []) };
  }

  // ---------- front office ----------
  private async frontOffice(ctx: { centreId: string; today: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx;
    const visitors = await safe(() => db.select({ id: records.id, name: records.title, status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'visitor'), eq(records.date, today))).orderBy(desc(records.createdAt)).limit(30).then((r) => r.map((v) => ({ id: v.id, name: v.name, status: v.status, purpose: J(v.data).purpose || '', toMeet: J(v.data).toMeet || '', inTime: J(v.data).inTime || '', outTime: J(v.data).outTime || '' }))), [] as any[]);
    const enq = await safe(async () => { const rows = await db.select().from(enquiries).where(eq(enquiries.centreId, centreId)); const due = rows.filter((e) => e.nextFollowUp && e.nextFollowUp <= today && !['admitted', 'lost'].includes(e.status)); const week = addDays(today, -7); const by = (s: string) => rows.filter((e) => e.status === s).length; return { followUps: due.slice(0, 6).map((e) => ({ id: e.id, name: e.name, mobile: e.mobile, className: e.className, due: e.nextFollowUp })), dueCount: due.length, newThisWeek: rows.filter((e) => String(e.createdAt).slice(0, 10) >= week).length, funnel: { new: by('new'), contacted: by('contacted'), demo: by('demo'), admitted: by('admitted'), lost: by('lost') } }; }, { followUps: [], dueCount: 0, newThisWeek: 0, funnel: { new: 0, contacted: 0, demo: 0, admitted: 0, lost: 0 } } as any);
    const adm = await safe(async () => { const rows = await db.select({ status: records.status, n: sql<number>`count(*)` }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'admission'))).groupBy(records.status); return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])); }, {} as Record<string, number>);
    const requests = await safe(() => db.select({ id: records.id, title: records.title, status: records.status, data: records.data, date: records.date }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'service-request'), inArray(records.status, ['open', 'in-progress']))).orderBy(desc(records.createdAt)).limit(6).then((r) => r.map((x) => ({ id: x.id, title: x.title, status: x.status, type: J(x.data).type || '', date: x.date }))), [] as any[]);
    return { visitors, enquiries: enq, admissions: adm, requests, notices: await safe(() => this.notices(centreId, null), []) };
  }

  // ---------- HR ----------
  private async hr(ctx: { centreId: string; today: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx; const month = today.slice(0, 7);
    const headcount = await safe(() => db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['FACULTY', 'STAFF']))).then((r) => Number(r[0]?.n || 0)), 0);
    const todayRows = await safe(() => db.select({ status: staffAttendance.status }).from(staffAttendance).where(and(eq(staffAttendance.centreId, centreId), eq(staffAttendance.date, today))), [] as any[]);
    const here = todayRows.filter((r: any) => ['present', 'late', 'half-day', 'manual'].includes(r.status)).length; const onLeave = todayRows.filter((r: any) => r.status === 'leave').length;
    const leaves = await safe(() => db.select({ id: records.id, reason: records.title, from: records.date, data: records.data, name: users.name }).from(records).leftJoin(users, eq(users.id, records.staffId)).where(and(eq(records.centreId, centreId), eq(records.kind, 'staff-leave'), eq(records.status, 'pending'))).orderBy(records.date).limit(8).then((r) => r.map((l) => ({ id: l.id, name: l.name || '', reason: l.reason, from: l.from, to: J(l.data).toDate || '', type: J(l.data).type || '', days: J(l.data).days || '' }))), [] as any[]);
    const openings = await safe(async () => { const o = await db.select({ id: records.id, title: records.title, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'job-opening'), eq(records.status, 'open'))); const c = await db.select({ status: records.status, n: sql<number>`count(*)` }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'candidate'))).groupBy(records.status); return { open: o.map((x) => ({ title: x.title, vacancies: J(x.data).vacancies || 1, lastDate: J(x.data).lastDate || '' })), candidates: Object.fromEntries(c.map((x) => [x.status, Number(x.n)])) }; }, { open: [], candidates: {} } as any);
    const employees = await safe(async () => { const e = await db.select({ name: records.title, status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'employee'))); const dept: Record<string, number> = {}; e.filter((x) => x.status === 'active').forEach((x) => { const k = J(x.data).department || 'Other'; dept[k] = (dept[k] || 0) + 1; }); const anniv = e.filter((x) => String(J(x.data).doj || '').slice(5) === today.slice(5) && String(J(x.data).doj || '').slice(0, 4) < today.slice(0, 4)).map((x) => ({ name: x.name, years: Number(today.slice(0, 4)) - Number(String(J(x.data).doj).slice(0, 4)) })); return { total: e.length, active: e.filter((x) => x.status === 'active').length, dept, anniversaries: anniv }; }, { total: 0, active: 0, dept: {}, anniversaries: [] } as any);
    const payroll = await safe(async () => { const p = await db.select({ status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'payslip'), gte(records.createdAt, new Date(month + '-01T00:00:00+05:30')))); return { draft: p.filter((x) => x.status === 'draft').length, paid: p.filter((x) => x.status === 'paid').length, net: p.filter((x) => x.status === 'draft').reduce((a, x) => a + Number(J(x.data).net || 0), 0) }; }, { draft: 0, paid: 0, net: 0 });
    return { headcount, here, onLeave, notMarked: Math.max(0, headcount - todayRows.length), leaves, openings, employees, payroll, notices: await safe(() => this.notices(centreId, null), []) };
  }

  // ---------- accounts ----------
  private async accounts(u: JwtUser, ctx: { centreId: string; today: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx; const sum = async (from: string, to: string) => Number((await db.select({ t: sql<string>`coalesce(sum(${feePayments.amount}), 0)` }).from(feePayments).where(and(eq(feePayments.centreId, centreId), gte(feePayments.paidOn, from), lte(feePayments.paidOn, to))))[0]?.t || 0);
    const month = today.slice(0, 7); const monthEnd = lastDay(month); const yearStart = (Number(month.slice(5)) >= 4 ? month.slice(0, 4) : String(Number(month.slice(0, 4)) - 1)) + '-04-01';
    const trend = await safe(async () => { const out = []; for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 - i, 1)); const m = d.toISOString().slice(0, 7); out.push({ month: m, amount: await sum(m + '-01', lastDay(m)) }); } return out; }, [] as any[]);
    const modes = await safe(() => db.select({ mode: feePayments.mode, t: sql<string>`sum(${feePayments.amount})`, n: sql<number>`count(*)` }).from(feePayments).where(and(eq(feePayments.centreId, centreId), gte(feePayments.paidOn, month + '-01'), lte(feePayments.paidOn, monthEnd))).groupBy(feePayments.mode).then((r) => r.map((x) => ({ mode: x.mode, amount: Number(x.t), count: Number(x.n) }))), [] as any[]);
    const ledger = await safe(() => this.fees.ledger({ ...u, role: 'ADMIN', centreId } as any, centreId), [] as any[]); const owing = ledger.filter((r: any) => r.balance > 0).sort((a: any, b: any) => b.balance - a.balance);
    const recent = await safe(() => db.select({ id: feePayments.id, amount: feePayments.amount, mode: feePayments.mode, paidOn: feePayments.paidOn, receipt: feePayments.receiptNo, name: students.name }).from(feePayments).innerJoin(students, eq(students.id, feePayments.studentId)).where(eq(feePayments.centreId, centreId)).orderBy(desc(feePayments.createdAt)).limit(8).then((r) => r.map((x) => ({ ...x, amount: Number(x.amount) }))), [] as any[]);
    const payroll = await safe(async () => { const p = await db.select({ status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'payslip'), eq(records.status, 'draft'))); return { draft: p.length, net: p.reduce((a, x) => a + Number(J(x.data).net || 0), 0) }; }, { draft: 0, net: 0 });
    const vendor = await safe(async () => { const r = await db.select({ status: records.status, n: sql<number>`count(*)` }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'fee-fine'))).groupBy(records.status); return Object.fromEntries(r.map((x) => [x.status, Number(x.n)])); }, {} as Record<string, number>);
    return { collected: { today: await safe(() => sum(today, today), 0), month: await safe(() => sum(month + '-01', monthEnd), 0), year: await safe(() => sum(yearStart, today), 0) }, trend, modes, outstanding: owing.reduce((a: number, r: any) => a + r.balance, 0), defaulters: owing.slice(0, 8).map((r: any) => ({ studentId: r.studentId, name: r.name, balance: r.balance })), defaulterCount: owing.length, recent, payroll, fines: vendor, notices: await safe(() => this.notices(centreId, null), []) };
  }

  // ---------- other non-teaching staff ----------
  private async otherStaff(u: JwtUser, ctx: { centreId: string; today: string }) {
    const db = this.dbs.db; const { centreId, today } = ctx;
    const leaves = await safe(() => db.select({ id: records.id, reason: records.title, from: records.date, status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'staff-leave'), eq(records.staffId, u.id))).orderBy(desc(records.createdAt)).limit(3).then((r) => r.map((l) => ({ id: l.id, reason: l.reason, from: l.from, status: l.status, to: J(l.data).toDate || '' }))), [] as any[]);
    const events = await safe(() => db.select({ id: records.id, title: records.title, date: records.date }).from(records).where(and(eq(records.centreId, centreId), inArray(records.kind, ['event', 'holiday']), gte(records.date, today))).orderBy(records.date).limit(4), [] as any[]);
    return { me: await safe(() => this.myMonth(u.id, centreId, today), null), duties: await safe(() => this.myDuties(u.id, centreId), []), leaves, events, notices: await safe(() => this.notices(centreId, null), []) };
  }
}
