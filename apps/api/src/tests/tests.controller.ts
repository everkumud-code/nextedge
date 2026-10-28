import { Body, Controller, Get, Param, Post, Put, Query, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { students, testAttempts, tests } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';

type Q = { q: string; opts: string[]; ans: 'A' | 'B' | 'C' | 'D'; chapter?: string; marks?: number };
class TestDto { @IsString() batchId: string; @IsString() title: string; @IsOptional() @IsString() subject?: string; @IsIn(['online', 'offline']) mode: string; @IsString() date: string; @IsOptional() @IsInt() @Min(1) durationMin?: number; @IsOptional() @IsInt() maxMarks?: number; @IsOptional() negative?: number; @IsOptional() @IsArray() questions?: Q[]; }
class SubmitDto { @IsString() studentId: string; @IsObject() answers: Record<string, string>; @IsOptional() @IsInt() tabSwitches?: number; }
class MarksDto { @IsArray() marks: { studentId: string; marks: number }[]; }

const pct = (rank: number, n: number) => (n <= 1 ? 100 : Math.round(((n - rank) / (n - 1)) * 100));

@Controller('tests')
@Mod('tests')
export class TestsController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  /** Staff: all tests (with questions + answers). Students/parents: tests of own batch; answers stripped until results publish. */
  @Get() async list(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    let bids: string[] | null = null; let mine: { id: string; batchId: string | null }[] = [];
    if (!staff) { mine = await myStudents(db, u, centreId); bids = [...new Set(mine.map((s) => s.batchId).filter((x): x is string => !!x))]; if (!bids.length) return []; }
    const where = bids ? and(eq(tests.centreId, centreId), inArray(tests.batchId, bids), eq(tests.published, true)) : batchId ? and(eq(tests.centreId, centreId), eq(tests.batchId, batchId)) : eq(tests.centreId, centreId);
    const rows = await db.select().from(tests).where(where).orderBy(desc(tests.date));
    if (staff) return rows.map((r) => ({ ...r, questions: JSON.parse(r.questions) }));
    const attempts = rows.length ? await db.select().from(testAttempts).where(and(inArray(testAttempts.testId, rows.map((r) => r.id)), inArray(testAttempts.studentId, mine.map((s) => s.id)))) : [];
    return rows.map((r) => { const qs: Q[] = JSON.parse(r.questions); const myAtt = attempts.filter((a) => a.testId === r.id);
      return { ...r, questions: r.resultsPublished ? qs : qs.map(({ ans, ...q }) => q), attempts: myAtt.map((a) => ({ studentId: a.studentId, submitted: !!a.submittedAt, marks: r.resultsPublished ? Number(a.marks) : null, chapterScores: r.resultsPublished ? JSON.parse(a.chapterScores) : null })) }; });
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async create(@CurrentUser() u: JwtUser, @Body() dto: TestDto, @Query('centreId') c?: string) {
    const qs = dto.questions || []; if (dto.mode === 'online' && !qs.length) throw new BadRequestException('Online test needs at least one question');
    const maxMarks = dto.mode === 'online' ? qs.reduce((a, q) => a + (q.marks || 1), 0) : dto.maxMarks || 100;
    const [row] = await this.dbs.db.insert(tests).values({ centreId: centreOf(u, c), batchId: dto.batchId, title: dto.title, subject: dto.subject, mode: dto.mode, date: dto.date, durationMin: dto.durationMin || 60, maxMarks, negative: String(dto.negative || 0), questions: JSON.stringify(qs), createdBy: u.id }).returning();
    return row;
  }

  /** Publish the test to students (they get a push) or publish results (students + parents get a push). */
  @Post(':id/publish') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async publish(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { what: 'test' | 'results'; value: boolean }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [t] = await this.dbs.db.update(tests).set(b.what === 'results' ? { resultsPublished: b.value } : { published: b.value }).where(and(eq(tests.id, id), eq(tests.centreId, centreId))).returning();
    if (t && b.value) { const aud = await this.notify.audienceForBatch(centreId, t.batchId, b.what === 'results' ? ['STUDENT', 'PARENT'] : ['STUDENT']);
      this.notify.notifyUsers(centreId, aud, b.what === 'results' ? `Results out: ${t.title}` : `New test: ${t.title}`, b.what === 'results' ? 'Open the app to see marks, rank and weak chapters.' : `${t.mode === 'online' ? 'Attempt in the app' : 'Paper test'} on ${t.date}.`, { data: { type: 'test', id: t.id } }); }
    return t;
  }

  /** Online attempt: auto-checked, negative marking, chapter-wise score. One attempt per student. */
  @Post(':id/submit') async submit(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: SubmitDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const mine = await myStudents(db, u, centreId); if (!mine.find((s) => s.id === dto.studentId)) throw new ForbiddenException('Not your student');
    const [t] = await db.select().from(tests).where(and(eq(tests.id, id), eq(tests.centreId, centreId), eq(tests.published, true))); if (!t) throw new BadRequestException('Test not available');
    if (t.mode !== 'online') throw new BadRequestException('This is an offline test');
    const [prev] = await db.select().from(testAttempts).where(and(eq(testAttempts.testId, id), eq(testAttempts.studentId, dto.studentId))); if (prev?.submittedAt) throw new BadRequestException('Already submitted');
    const qs: Q[] = JSON.parse(t.questions); const neg = Number(t.negative); let total = 0; const ch: Record<string, { got: number; total: number }> = {};
    qs.forEach((q, i) => { const m = q.marks || 1; const a = dto.answers?.[String(i)]; const key = q.chapter || 'General'; ch[key] ||= { got: 0, total: 0 }; ch[key].total += m;
      if (a === q.ans) { total += m; ch[key].got += m; } else if (a) { total -= neg; } });
    total = Math.max(0, Math.round(total * 100) / 100);
    const vals = { centreId, testId: id, studentId: dto.studentId, answers: JSON.stringify(dto.answers || {}), marks: String(total), chapterScores: JSON.stringify(ch), tabSwitches: dto.tabSwitches || 0, submittedAt: new Date() };
    if (prev) await db.update(testAttempts).set(vals).where(eq(testAttempts.id, prev.id)); else await db.insert(testAttempts).values(vals);
    return { ok: true, marks: total, maxMarks: t.maxMarks, resultsPublished: t.resultsPublished };
  }

  /** Offline test: faculty enters marks in bulk. */
  @Put(':id/marks') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async marks(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: MarksDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    for (const m of dto.marks) { const [prev] = await db.select().from(testAttempts).where(and(eq(testAttempts.testId, id), eq(testAttempts.studentId, m.studentId)));
      if (prev) await db.update(testAttempts).set({ marks: String(m.marks), submittedAt: new Date() }).where(eq(testAttempts.id, prev.id)); else await db.insert(testAttempts).values({ centreId, testId: id, studentId: m.studentId, marks: String(m.marks), submittedAt: new Date() }); }
    return { ok: true, count: dto.marks.length };
  }

  /** Result sheet: rank, percentile, batch average, topper, weak chapters (<50%). Students/parents only after results publish. */
  @Get(':id/results') async results(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    const [t] = await db.select().from(tests).where(and(eq(tests.id, id), eq(tests.centreId, centreId))); if (!t) return null;
    if (!staff && !t.resultsPublished) throw new ForbiddenException('Results not published yet');
    const sts = await db.select({ id: students.id, name: students.name, rollNo: students.rollNo }).from(students).where(and(eq(students.batchId, t.batchId), eq(students.active, true)));
    const atts = await db.select().from(testAttempts).where(eq(testAttempts.testId, id));
    const scored = sts.map((s) => { const a = atts.find((x) => x.studentId === s.id && x.submittedAt); return { ...s, marks: a ? Number(a.marks) : null, chapterScores: a ? JSON.parse(a.chapterScores) : {}, tabSwitches: a?.tabSwitches || 0 }; });
    const ranked = scored.filter((s) => s.marks !== null).sort((a, b) => b.marks! - a.marks!);
    const n = ranked.length; const avg = n ? Math.round((ranked.reduce((a, s) => a + s.marks!, 0) / n) * 10) / 10 : 0;
    const rows = scored.map((s) => { const r = ranked.findIndex((x) => x.id === s.id); const weak = Object.entries(s.chapterScores as Record<string, { got: number; total: number }>).filter(([, v]) => v.total && v.got / v.total < 0.5).map(([k]) => k);
      return { ...s, rank: r >= 0 ? r + 1 : null, percentile: r >= 0 ? pct(r + 1, n) : null, weakChapters: weak }; });
    // students/parents see the batch rank list (name, marks, rank) but other students' chapter detail stays private
    const out = staff ? rows : rows.map((r) => ({ id: r.id, name: r.name, rollNo: r.rollNo, marks: r.marks, rank: r.rank }));
    const mine = staff ? [] : await myStudents(db, u, centreId);
    return { test: { ...t, questions: JSON.parse(t.questions) }, maxMarks: t.maxMarks, attempted: n, average: avg, topper: ranked[0] ? { name: ranked[0].name, marks: ranked[0].marks } : null, rows: out, mine: staff ? undefined : rows.filter((r) => mine.find((m) => m.id === r.id)) };
  }
}
