import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, centres, centreSettings, examMarks, exams, records, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';
import { CardExam, DEFAULT_SCALE, gradeOf, reportCardPdf, Scale } from './report-card';

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'];
type Subj = { name: string; max: number };

/** School exams: term exams per section, subject-wise marks grid, grades, rank, analysis, published results, report-card PDF. */
@Controller('exams')
@Mod('exams')
export class ExamsController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService) {}

  private async scale(centreId: string): Promise<Scale> { const s = await this.platform.settings(centreId); try { return s.gradeScale ? JSON.parse(s.gradeScale) : DEFAULT_SCALE; } catch { return DEFAULT_SCALE; } }

  @Get('grade-scale') async gradeScale(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { return this.scale(centreOf(u, c)); }
  @Put('grade-scale') @Roles('SUPER_ADMIN', 'ADMIN') async setScale(@CurrentUser() u: JwtUser, @Body() b: { scale: Scale }, @Query('centreId') c?: string) { const centreId = centreOf(u, c); await this.platform.settings(centreId); await this.dbs.db.update(centreSettings).set({ gradeScale: JSON.stringify(b.scale) }).where(eq(centreSettings.centreId, centreId)); return { ok: true }; }

  /** Student/parent: published exams with own marks, grade, percentage and rank. */
  @Get('mine') async mine(@CurrentUser() u: JwtUser, @Query('studentId') studentId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const mine = await myStudents(db, u, centreId); const st = mine.find((s) => s.id === studentId) || mine[0]; if (!st) return [];
    const ex = await db.select().from(exams).where(and(eq(exams.centreId, centreId), eq(exams.batchId, st.batchId!), eq(exams.published, true))).orderBy(exams.date);
    const scale = await this.scale(centreId); const out = [];
    for (const e of ex) out.push({ ...(await this.cardFor(e, st.id, scale)), id: e.id, examName: e.name, term: e.term, date: e.date });
    return out;
  }

  @Get('report-card/:studentId.pdf') async reportCard(@CurrentUser() u: JwtUser, @Param('studentId') studentId: string, @Res() res: any, @Query('term') term?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [st] = await db.select().from(students).where(and(eq(students.id, studentId), eq(students.centreId, centreId))); if (!st) throw new NotFoundException();
    const isStaff = STAFF.includes(u.role); if (!isStaff) { const mine = await myStudents(db, u, centreId); if (!mine.some((s) => s.id === st.id)) throw new ForbiddenException(); }
    const s = await this.platform.settings(centreId); const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const session = s.academicSession || `${new Date().getFullYear()}-${String(new Date().getFullYear() + 1).slice(2)}`;
    const [b] = st.batchId ? await db.select().from(batches).where(eq(batches.id, st.batchId)) : [];
    let ex = st.batchId ? await db.select().from(exams).where(and(eq(exams.centreId, centreId), eq(exams.batchId, st.batchId))).orderBy(exams.date) : [];
    if (!isStaff) ex = ex.filter((e) => e.published); const t = term || ex[ex.length - 1]?.term || 'Term 1'; ex = ex.filter((e) => e.term === t);
    const scale = await this.scale(centreId); const cards: CardExam[] = []; for (const e of ex) { const cd = await this.cardFor(e, st.id, scale); cards.push({ name: e.name, subjects: cd.subjects, total: cd.total, maxTotal: cd.maxTotal, pct: cd.pct, grade: cd.grade, rank: cd.rank, of: cd.of }); }
    const att = await db.select({ status: attendance.status, n: sql<number>`count(*)` }).from(attendance).where(eq(attendance.studentId, st.id)).groupBy(attendance.status);
    const present = att.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').reduce((a, x) => a + Number(x.n), 0); const total = att.filter((a) => a.status !== 'LEAVE').reduce((a, x) => a + Number(x.n), 0);
    const [rm] = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'report-remark'), eq(records.studentId, st.id), eq(records.title, t)));
    const ct = b?.classTeacherId ? (await db.select({ name: users.name }).from(users).where(eq(users.id, b.classTeacherId)))[0]?.name : null;
    const pdf = await reportCardPdf({ centre: { name: ce.name, address: s.address || ce.city, board: s.board, affiliationNo: s.affiliationNo, udise: s.udiseCode, phone: s.phone, principal: s.principalName }, session, term: t, student: { name: st.name, className: b?.className || st.className || '', section: b?.section, rollNo: st.rollNo, admissionNo: st.admissionNo, dob: st.dob, father: st.fatherName || st.parentName, mother: st.motherName }, exams: cards, attendance: total ? { present, total } : undefined, remark: rm ? JSON.parse(rm.data) : undefined, scale, classTeacher: ct });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="report-card-${st.rollNo || st.id.slice(0, 6)}.pdf"`); res.end(pdf);
  }

  @Get() @Roles(...STAFF) async list(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const where = batchId ? and(eq(exams.centreId, centreId), eq(exams.batchId, batchId)) : eq(exams.centreId, centreId);
    const rows = await db.select({ e: exams, batchName: batches.name }).from(exams).innerJoin(batches, eq(batches.id, exams.batchId)).where(where).orderBy(exams.date);
    const counts = rows.length ? await db.select({ examId: examMarks.examId, n: sql<number>`count(*)` }).from(examMarks).where(inArray(examMarks.examId, rows.map((r) => r.e.id))).groupBy(examMarks.examId) : [];
    return rows.map((r) => ({ ...r.e, subjects: JSON.parse(r.e.subjects) as Subj[], batchName: r.batchName, entered: Number(counts.find((x) => x.examId === r.e.id)?.n || 0) }));
  }

  @Post() @Roles(...STAFF) async create(@CurrentUser() u: JwtUser, @Body() b: { batchId: string; name: string; term?: string; date?: string; subjects: Subj[]; copyBatchIds?: string[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const subjects = (b.subjects || []).filter((s) => s.name?.trim() && Number(s.max) > 0).map((s) => ({ name: s.name.trim(), max: Number(s.max) })); if (!b.name?.trim()) throw new BadRequestException('Exam name is required'); if (!subjects.length) throw new BadRequestException('Add at least one subject with maximum marks');
    const s = await this.platform.settings(centreId); const ids = [b.batchId, ...(b.copyBatchIds || [])]; const out = [];
    for (const batchId of ids) { const [bt] = await db.select({ id: batches.id }).from(batches).where(and(eq(batches.id, batchId), eq(batches.centreId, centreId))); if (!bt) continue; const [row] = await db.insert(exams).values({ centreId, batchId, name: b.name.trim(), term: b.term || 'Term 1', session: s.academicSession, subjects: JSON.stringify(subjects), date: b.date || null }).returning(); out.push(row); }
    return { created: out.length, exams: out };
  }

  @Put(':id') @Roles(...STAFF) async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { name?: string; term?: string; date?: string; subjects?: Subj[] }, @Query('centreId') c?: string) {
    const set: any = {}; if (b.name) set.name = b.name; if (b.term) set.term = b.term; if (b.date !== undefined) set.date = b.date || null; if (b.subjects) set.subjects = JSON.stringify(b.subjects.filter((s) => s.name?.trim() && Number(s.max) > 0).map((s) => ({ name: s.name.trim(), max: Number(s.max) })));
    const [row] = await this.dbs.db.update(exams).set(set).where(and(eq(exams.id, id), eq(exams.centreId, centreOf(u, c)))).returning(); if (!row) throw new NotFoundException(); return row;
  }
  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) { const centreId = centreOf(u, c); const [e] = await this.dbs.db.select({ id: exams.id }).from(exams).where(and(eq(exams.id, id), eq(exams.centreId, centreId))); if (!e) throw new NotFoundException(); await this.dbs.db.delete(examMarks).where(eq(examMarks.examId, id)); await this.dbs.db.delete(exams).where(eq(exams.id, id)); return { ok: true }; }

  /** Marks grid: every active student of the section × subjects. */
  @Get(':id/marks') @Roles(...STAFF) async marks(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [e] = await db.select().from(exams).where(and(eq(exams.id, id), eq(exams.centreId, centreId))); if (!e) throw new NotFoundException();
    const sts = await db.select({ id: students.id, name: students.name, rollNo: students.rollNo }).from(students).where(and(eq(students.batchId, e.batchId), eq(students.active, true))); sts.sort((a, b) => (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0) || a.name.localeCompare(b.name));
    const ms = await db.select().from(examMarks).where(eq(examMarks.examId, id));
    return { exam: { ...e, subjects: JSON.parse(e.subjects) as Subj[] }, students: sts.map((s) => ({ ...s, marks: Object.fromEntries(ms.filter((m) => m.studentId === s.id).map((m) => [m.subject, { marks: m.marks === null ? null : Number(m.marks), absent: m.absent }])) })) };
  }

  @Put(':id/marks') @Roles(...STAFF) async saveMarks(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { rows: { studentId: string; subject: string; marks: number | null; absent?: boolean }[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [e] = await db.select().from(exams).where(and(eq(exams.id, id), eq(exams.centreId, centreId))); if (!e) throw new NotFoundException(); const subj: Subj[] = JSON.parse(e.subjects);
    const ok = await db.select({ id: students.id }).from(students).where(and(eq(students.batchId, e.batchId), eq(students.centreId, centreId))); const valid = new Set(ok.map((s) => s.id)); let saved = 0; const errors: string[] = [];
    for (const r of b.rows || []) {
      const sj = subj.find((s) => s.name === r.subject); if (!sj || !valid.has(r.studentId)) continue; if (r.marks !== null && r.marks !== undefined && (Number(r.marks) < 0 || Number(r.marks) > sj.max)) { errors.push(`${r.subject}: ${r.marks} is above maximum ${sj.max}`); continue; }
      await db.delete(examMarks).where(and(eq(examMarks.examId, id), eq(examMarks.studentId, r.studentId), eq(examMarks.subject, r.subject)));
      if ((r.marks !== null && r.marks !== undefined) || r.absent) { await db.insert(examMarks).values({ examId: id, studentId: r.studentId, subject: r.subject, marks: r.absent || r.marks === null || r.marks === undefined ? null : String(r.marks), absent: !!r.absent }); saved++; }
    }
    return { saved, errors };
  }

  @Post(':id/publish') @Roles('SUPER_ADMIN', 'ADMIN') async publish(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { value: boolean }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const [e] = await this.dbs.db.update(exams).set({ published: !!b.value }).where(and(eq(exams.id, id), eq(exams.centreId, centreId))).returning(); if (!e) throw new NotFoundException();
    if (b.value) { const aud = await this.notify.audienceForBatch(centreId, e.batchId); this.notify.notifyUsers(centreId, aud, `Results published: ${e.name}`, 'Open the app to see marks, grade and rank.', { data: { type: 'exam', id: e.id } }); }
    return { ok: true, published: e.published };
  }

  /** Class analysis: per-subject average/high/low/pass %, ranking list, grade distribution. */
  @Get(':id/analysis') @Roles(...STAFF) async analysis(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const g = await this.marks(u, id, c); const scale = await this.scale(centreId); const subj = g.exam.subjects;
    const bySubject = subj.map((s) => { const v = g.students.map((st) => st.marks[s.name]).filter((m) => m && !m.absent && m.marks !== null).map((m) => m.marks as number); const avg = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; return { subject: s.name, max: s.max, appeared: v.length, average: Math.round(avg * 10) / 10, avgPct: Math.round((avg / s.max) * 1000) / 10, highest: v.length ? Math.max(...v) : 0, lowest: v.length ? Math.min(...v) : 0, passPct: v.length ? Math.round((v.filter((x) => (x / s.max) * 100 >= 33).length / v.length) * 100) : 0 }; });
    const ranking = g.students.map((st) => { const entries = subj.map((s) => ({ s, m: st.marks[s.name] })).filter((x) => x.m && !x.m.absent && x.m.marks !== null); const total = entries.reduce((a, x) => a + (x.m!.marks as number), 0), max = entries.reduce((a, x) => a + x.s.max, 0); const pct = max ? (total / max) * 100 : 0; return { studentId: st.id, name: st.name, rollNo: st.rollNo, total, max, pct: Math.round(pct * 10) / 10, grade: max ? gradeOf(pct, scale) : '—', entered: entries.length }; }).filter((r) => r.entered > 0).sort((a, b) => b.pct - a.pct).map((r, i) => ({ ...r, rank: i + 1 }));
    const dist: Record<string, number> = {}; ranking.forEach((r) => (dist[r.grade] = (dist[r.grade] || 0) + 1));
    return { exam: g.exam, students: g.students.length, appeared: ranking.length, classAverage: ranking.length ? Math.round((ranking.reduce((a, r) => a + r.pct, 0) / ranking.length) * 10) / 10 : 0, bySubject, ranking, gradeDistribution: dist, weak: ranking.filter((r) => r.pct < 40).map((r) => r.name) };
  }

  // ---- helpers ----
  private async cardFor(e: typeof exams.$inferSelect, studentId: string, scale: Scale) {
    const db = this.dbs.db; const subj: Subj[] = JSON.parse(e.subjects); const sts = await db.select({ id: students.id }).from(students).where(and(eq(students.batchId, e.batchId), eq(students.active, true))); const ms = await db.select().from(examMarks).where(eq(examMarks.examId, e.id));
    const totalOf = (sid: string) => { let t = 0, mx = 0; subj.forEach((s) => { const m = ms.find((x) => x.studentId === sid && x.subject === s.name); if (m && !m.absent && m.marks !== null) { t += Number(m.marks); mx += s.max; } }); return { t, mx }; };
    const mine = totalOf(studentId); const pct = mine.mx ? (mine.t / mine.mx) * 100 : 0; const all = sts.map((s) => totalOf(s.id)).filter((x) => x.mx > 0).map((x) => (x.t / x.mx) * 100).sort((a, b) => b - a);
    const subjects = subj.map((s) => { const m = ms.find((x) => x.studentId === studentId && x.subject === s.name); const mk = m && m.marks !== null ? Number(m.marks) : null; return { name: s.name, max: s.max, marks: mk, absent: !!m?.absent, grade: mk !== null ? gradeOf((mk / s.max) * 100, scale) : '-' }; });
    return { subjects, total: mine.t, maxTotal: mine.mx, pct: Math.round(pct * 10) / 10, grade: mine.mx ? gradeOf(pct, scale) : '-', rank: mine.mx ? all.findIndex((x) => x <= pct + 1e-9) + 1 : null, of: all.length };
  }
}
