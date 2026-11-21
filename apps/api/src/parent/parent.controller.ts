import { Controller, ForbiddenException, Get, Param, Query } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, exams, facultyBatches, feePayments, homework, homeworkSubmissions, leaveRequests, noticeReads, notices, records, students, timetableSlots, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { FeesController } from '../fees/fees.controller';
import { buildAlerts, monthRows, weekOf, type Alert } from './parent-logic';

const istDay = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const J = (s: string | null | undefined) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => { try { return await fn(); } catch { return fallback; } }; // one broken block must never blank the whole portal

/**
 * The parent portal: everything a parent needs about each child, scoped to the children whose parent mobile is this login's mobile.
 * Read-only. (Applying for leave, paying, booking a PTM and feedback keep using their own endpoints, which already check "is this my child".)
 */
@Controller('parent')
@Roles('PARENT', 'STUDENT')
export class ParentController {
  constructor(private dbs: DbService, private fees: FeesController) {}

  /** Home: each child with the things that need the parent's attention today. */
  @Get('overview') async overview(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const db = this.dbs.db; const centreId = centreOf(u, c); const today = istDay(); const kids = await myStudents(db, u, centreId);
    const ledger = await safe(() => this.fees.ledger(u, centreId), [] as any[]);
    const out: { id: string; name: string; className: string; section: string; rollNo: string | null; alerts: Alert[] }[] = [];
    for (const st of kids) {
      const [batch] = st.batchId ? await db.select({ className: batches.className, name: batches.name, section: batches.section }).from(batches).where(eq(batches.id, st.batchId)) : [];
      const from = addDays(today, -60);
      const days = await safe(() => db.select({ date: attendance.date, status: attendance.status }).from(attendance).where(and(eq(attendance.studentId, st.id), gte(attendance.date, from))), [] as any[]);
      const hw = st.batchId ? await safe(async () => {
        const rows = await db.select({ id: homework.id, title: homework.title, subject: homework.subject, dueAt: homework.dueAt }).from(homework).where(and(eq(homework.batchId, st.batchId!), gte(homework.dueAt, new Date(Date.now() - 14 * 864e5)))).limit(60);
        const subs = rows.length ? await db.select({ id: homeworkSubmissions.homeworkId }).from(homeworkSubmissions).where(and(eq(homeworkSubmissions.studentId, st.id), inArray(homeworkSubmissions.homeworkId, rows.map((r) => r.id)))) : [];
        const done = new Set(subs.map((s) => s.id)); return rows.filter((r) => !done.has(r.id)).map((r) => ({ title: r.title, subject: r.subject || '', dueAt: r.dueAt.toISOString() }));
      }, [] as any[]) : [];
      const ex = st.batchId ? await safe(() => db.select({ name: exams.name, date: exams.date, published: exams.published }).from(exams).where(eq(exams.batchId, st.batchId!)), [] as any[]) : [];
      const loans = await safe(() => db.select({ status: records.status, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'loan'), eq(records.studentId, st.id), inArray(records.status, ['issued', 'overdue']))).then((r) => r.filter((x) => { const d = J(x.data).dueDate; return !!d && d < today; }).length), 0);
      const leaves = await safe(() => db.select({ status: leaveRequests.status, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, createdAt: leaveRequests.createdAt }).from(leaveRequests).where(and(eq(leaveRequests.studentId, st.id), gte(leaveRequests.createdAt, new Date(Date.now() - 7 * 864e5)))), [] as any[]);
      const fee = ledger.find((l: any) => l.studentId === st.id);
      out.push({ id: st.id, name: st.name, className: batch?.className || st.className || '', section: batch?.section || '', rollNo: st.rollNo, alerts: buildAlerts({ name: st.name, today, days: days as any, homework: hw, exams: ex as any, booksOverdue: loans, balance: fee ? Number(fee.balance) : 0, leaves: leaves as any }) });
    }
    const bids = [...new Set(kids.map((k) => k.batchId).filter((x): x is string => !!x))];
    const recent = await safe(async () => {
      const rows = await db.select({ id: notices.id, expiresAt: notices.expiresAt }).from(notices).where(and(eq(notices.centreId, centreId), gte(notices.publishedAt, new Date(Date.now() - 21 * 864e5)), bids.length ? or(isNull(notices.batchId), inArray(notices.batchId, bids)) : isNull(notices.batchId)));
      const live = rows.filter((r) => !r.expiresAt || r.expiresAt > new Date()); const seen = live.length ? await db.select({ id: noticeReads.noticeId }).from(noticeReads).where(and(eq(noticeReads.userId, u.id), inArray(noticeReads.noticeId, live.map((r) => r.id)))) : [];
      return live.length - seen.length;
    }, 0);
    return { children: out, unreadNotices: recent };
  }

  /** One child in full: class and teachers, the week's timetable, attendance by month and by day, and fee receipts. */
  @Get('child/:id') async child(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const db = this.dbs.db; const centreId = centreOf(u, c); const kids = await myStudents(db, u, centreId); const st = kids.find((k) => k.id === id); if (!st) throw new ForbiddenException('This student is not linked to your login.');
    const today = istDay(); const [batch] = st.batchId ? await db.select().from(batches).where(eq(batches.id, st.batchId)) : [];
    const ct = batch?.classTeacherId ? (await db.select({ name: users.name }).from(users).where(eq(users.id, batch.classTeacherId)))[0]?.name || null : null;
    const teachers = st.batchId ? await safe(async () => {
      const rows = await db.select({ id: facultyBatches.facultyId, name: users.name, subject: facultyBatches.subject }).from(facultyBatches).innerJoin(users, eq(users.id, facultyBatches.facultyId)).where(and(eq(facultyBatches.centreId, centreId), eq(facultyBatches.batchId, st.batchId!)));
      const list = rows.map((r) => ({ id: r.id, name: r.name, subject: r.subject || '', classTeacher: !!batch?.classTeacherId && r.id === batch.classTeacherId }));
      if (batch?.classTeacherId && !list.some((t) => t.id === batch.classTeacherId)) list.unshift({ id: batch.classTeacherId, name: ct || 'Class teacher', subject: '', classTeacher: true });
      return list.sort((a, b) => Number(b.classTeacher) - Number(a.classTeacher) || a.name.localeCompare(b.name));
    }, [] as any[]) : [];
    const slots = st.batchId ? await safe(() => db.select({ weekday: timetableSlots.weekday, start: timetableSlots.startTime, end: timetableSlots.endTime, subject: timetableSlots.subject, room: timetableSlots.room, period: timetableSlots.period, teacher: users.name }).from(timetableSlots).leftJoin(users, eq(users.id, timetableSlots.facultyId)).where(and(eq(timetableSlots.batchId, st.batchId!), eq(timetableSlots.centreId, centreId))), [] as any[]) : [];
    const days = await safe(() => db.select({ date: attendance.date, status: attendance.status }).from(attendance).where(and(eq(attendance.studentId, st.id), gte(attendance.date, addDays(today, -200)))).orderBy(attendance.date), [] as any[]);
    const receipts = await safe(() => db.select({ id: feePayments.id, receiptNo: feePayments.receiptNo, amount: feePayments.amount, mode: feePayments.mode, paidOn: feePayments.paidOn }).from(feePayments).where(and(eq(feePayments.centreId, centreId), eq(feePayments.studentId, st.id))).orderBy(desc(feePayments.paidOn)).limit(60).then((r) => r.map((x) => ({ ...x, amount: Number(x.amount) }))), [] as any[]);
    const fee = (await safe(() => this.fees.ledger(u, centreId), [] as any[])).find((l: any) => l.studentId === st.id);
    const leaves = await safe(() => db.select({ id: leaveRequests.id, fromDate: leaveRequests.fromDate, toDate: leaveRequests.toDate, reason: leaveRequests.reason, status: leaveRequests.status, note: leaveRequests.note }).from(leaveRequests).where(eq(leaveRequests.studentId, st.id)).orderBy(desc(leaveRequests.createdAt)).limit(20), [] as any[]);
    const upcomingExams = st.batchId ? await safe(() => db.select({ id: exams.id, name: exams.name, term: exams.term, date: exams.date }).from(exams).where(and(eq(exams.centreId, centreId), eq(exams.batchId, st.batchId!), gte(exams.date, today))).orderBy(exams.date).limit(6), [] as any[]) : [];
    const months = monthRows(days as any, today);
    const ok = (days as any[]).filter((d) => d.status !== 'LEAVE'); const overallPct = ok.length ? Math.round((ok.filter((d) => d.status === 'PRESENT' || d.status === 'LATE').length / ok.length) * 100) : null;
    return {
      profile: { id: st.id, batchId: st.batchId, name: st.name, className: batch?.className || st.className || '', section: batch?.section || '', batch: batch?.name || '', rollNo: st.rollNo, admissionNo: st.admissionNo, classTeacher: ct },
      teachers, week: weekOf(slots as any),
      attendance: { overallPct, months, days: (days as any[]).map((d) => ({ date: d.date, status: d.status })) },
      fees: fee ? { plan: fee.plan?.name || '', cycle: fee.plan?.cycle || '', due: fee.due, paid: fee.paid, balance: fee.balance } : null,
      receipts, leaves, upcomingExams,
    };
  }
}
