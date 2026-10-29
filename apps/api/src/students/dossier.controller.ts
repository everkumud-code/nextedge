import { Controller, ForbiddenException, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, exams, feePayments, homeworkSubmissions, records, students, testAttempts, tests, users } from '../db/schema';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { FeesController } from '../fees/fees.controller';
import { ExamsController } from '../exams/exams.controller';

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'];
/** Student dossier: one call with everything the school knows about a student. Staff see all; parents see their own child (parent-visible records only). */
@Controller('students')
@Mod('students')
export class DossierController {
  constructor(private dbs: DbService, private fees: FeesController, private exams: ExamsController) {}

  @Get(':id/dossier') async dossier(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = STAFF.includes(u.role);
    const [st] = await db.select().from(students).where(and(eq(students.id, id), eq(students.centreId, centreId))); if (!st) throw new NotFoundException();
    if (!staff) { const mine = await myStudents(db, u, centreId); if (!mine.some((s) => s.id === id)) throw new ForbiddenException(); }
    const [b] = st.batchId ? await db.select().from(batches).where(eq(batches.id, st.batchId)) : [];
    const ct = b?.classTeacherId ? (await db.select({ name: users.name }).from(users).where(eq(users.id, b.classTeacherId)))[0]?.name : null;
    const att = await db.select({ status: attendance.status, n: sql<number>`count(*)` }).from(attendance).where(eq(attendance.studentId, id)).groupBy(attendance.status); const g = (s: string) => Number(att.find((a) => a.status === s)?.n || 0);
    const present = g('PRESENT') + g('LATE'), total = present + g('ABSENT'); const recent = await db.select({ date: attendance.date, status: attendance.status }).from(attendance).where(eq(attendance.studentId, id)).orderBy(desc(attendance.date)).limit(30);
    const adminLike = { ...u, role: 'ADMIN', centreId } as any; const led = (await this.fees.ledger(adminLike, centreId)).find((r) => r.studentId === id) || null;
    const pays = await db.select().from(feePayments).where(eq(feePayments.studentId, id)).orderBy(desc(feePayments.paidOn)).limit(30);
    const att2 = await db.select({ marks: testAttempts.marks, title: tests.title, date: tests.date, maxMarks: tests.maxMarks }).from(testAttempts).innerJoin(tests, eq(tests.id, testAttempts.testId)).where(and(eq(testAttempts.studentId, id), sql`${testAttempts.submittedAt} is not null`)).orderBy(desc(tests.date)).limit(20).catch(() => []);
    const hw = await db.select({ n: sql<number>`count(*)` }).from(homeworkSubmissions).where(eq(homeworkSubmissions.studentId, id)).catch(() => [{ n: 0 }]);
    const exs = await this.exams.mine({ ...u, role: staff ? 'ADMIN' : u.role } as any, id, c).catch(() => []);
    const examResults = staff && b ? await this.allExams(centreId, id, b.id) : exs;
    const recs = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.studentId, id))).orderBy(desc(records.date), desc(records.createdAt)).limit(300);
    const visible = recs.filter((r) => staff || r.parentVisible).filter((r) => !['ptm-feedback'].includes(r.kind) || staff).map((r) => ({ ...r, data: JSON.parse(r.data) }));
    const by = (k: string) => visible.filter((r) => r.kind === k);
    return { student: { ...st, className: b?.className || st.className, section: b?.section, batchName: b?.name, classTeacher: ct }, attendance: { present, total, pct: total ? Math.round((present / total) * 100) : null, leave: g('LEAVE'), absent: g('ABSENT'), late: g('LATE'), recent }, fees: { ledger: led, payments: pays }, tests: att2, homeworkSubmitted: Number(hw[0]?.n || 0), exams: examResults, conduct: { discipline: by('discipline'), achievements: by('achievement'), health: by('health') }, services: { transport: by('transport-assign'), library: by('loan'), certificates: by('certificate'), requests: by('service-request'), fines: by('fee-fine'), remarks: by('report-remark') } };
  }
  private async allExams(centreId: string, studentId: string, batchId: string) { const r: any[] = []; const list = await this.dbs.db.select().from(exams).where(and(eq(exams.centreId, centreId), eq(exams.batchId, batchId))).orderBy(exams.date); for (const e of list) { const card = await (this.exams as any).cardFor(e, studentId, await (this.exams as any).scale(centreId)); r.push({ ...card, id: e.id, examName: e.name, term: e.term, date: e.date, published: e.published }); } return r; }
}
