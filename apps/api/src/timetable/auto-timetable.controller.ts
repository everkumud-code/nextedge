import { BadRequestException, Body, Controller, Get, Post, Put, Param, Query } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, bellPeriods, timetableRequirements, timetableSlots, timetableTeacherRules, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { AuditSlot, Cell, Period, Req, Rule, audit, generate } from './auto-timetable';

const SETUP = ['SUPER_ADMIN', 'ADMIN', 'STAFF'] as const;
const int = (v: any, lo: number, hi: number, d: number | null = null) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
const ov = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;

/** Automatic timetable: setup (what each class needs, teacher limits) and the maker itself (preview, then save). */
@Controller('timetable/auto')
@Mod('timetable')
export class AutoTimetableController {
  constructor(private dbs: DbService) {}

  // ---------- setup: requirements per class ----------
  @Get('requirements') @Roles(...SETUP) async requirements(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const rows = await this.dbs.db.select().from(timetableRequirements).where(batchId ? and(eq(timetableRequirements.centreId, centreId), eq(timetableRequirements.batchId, batchId)) : eq(timetableRequirements.centreId, centreId));
    return rows.map((r) => ({ id: r.id, batchId: r.batchId, subject: r.subject, facultyId: r.facultyId, perWeek: r.perWeek, doubles: r.doubles, maxPerDay: r.maxPerDay }));
  }
  private cleanRows(rows: any[]) {
    const out: { subject: string; facultyId: string | null; perWeek: number; doubles: number; maxPerDay: number | null }[] = [];
    for (const r of rows || []) {
      const subject = String(r?.subject || '').trim().slice(0, 60); if (!subject) continue;
      const perWeek = int(r.perWeek, 1, 40); if (!perWeek) throw new BadRequestException(`${subject}: periods per week must be between 1 and 40`);
      const doubles = int(r.doubles, 0, 20, 0)!; if (doubles * 2 > perWeek) throw new BadRequestException(`${subject}: ${doubles} double period(s) need ${doubles * 2} periods a week, but only ${perWeek} are asked for`);
      out.push({ subject, facultyId: r.facultyId ? String(r.facultyId) : null, perWeek, doubles, maxPerDay: int(r.maxPerDay, 1, 10) });
    }
    return out;
  }
  @Put('requirements/:batchId') @Roles(...SETUP) async setRequirements(@CurrentUser() u: JwtUser, @Param('batchId') batchId: string, @Body() b: { rows: any[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [bt] = await db.select({ id: batches.id }).from(batches).where(and(eq(batches.id, batchId), eq(batches.centreId, centreId))); if (!bt) throw new BadRequestException('Class not found');
    const rows = this.cleanRows(b.rows); const subjects = rows.map((r) => `${r.subject.toLowerCase()}|${r.facultyId || ''}`); if (new Set(subjects).size !== subjects.length) throw new BadRequestException('The same subject with the same teacher is listed twice. Merge them into one row.');
    await db.transaction(async (tx: any) => { await tx.delete(timetableRequirements).where(and(eq(timetableRequirements.centreId, centreId), eq(timetableRequirements.batchId, batchId))); if (rows.length) await tx.insert(timetableRequirements).values(rows.map((r) => ({ ...r, centreId, batchId }))); });
    return { ok: true, saved: rows.length };
  }
  /** Copy one class's plan to other sections (replaces what they had). */
  @Post('requirements/copy') @Roles(...SETUP) async copy(@CurrentUser() u: JwtUser, @Body() b: { fromBatchId: string; toBatchIds: string[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const to = (b.toBatchIds || []).filter((x) => x !== b.fromBatchId); if (!to.length) throw new BadRequestException('Choose the classes to copy to');
    const ok = await db.select({ id: batches.id }).from(batches).where(and(eq(batches.centreId, centreId), inArray(batches.id, [b.fromBatchId, ...to]))); if (ok.length !== to.length + 1) throw new BadRequestException('Class not found');
    const src = await db.select().from(timetableRequirements).where(and(eq(timetableRequirements.centreId, centreId), eq(timetableRequirements.batchId, b.fromBatchId))); if (!src.length) throw new BadRequestException('The source class has no subjects yet');
    await db.transaction(async (tx: any) => { await tx.delete(timetableRequirements).where(and(eq(timetableRequirements.centreId, centreId), inArray(timetableRequirements.batchId, to))); await tx.insert(timetableRequirements).values(to.flatMap((t) => src.map((r) => ({ centreId, batchId: t, subject: r.subject, facultyId: r.facultyId, perWeek: r.perWeek, doubles: r.doubles, maxPerDay: r.maxPerDay })))); });
    return { ok: true, copiedTo: to.length };
  }

  // ---------- setup: teacher limits ----------
  @Get('rules') @Roles(...SETUP) async rules(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const rows = await this.dbs.db.select().from(timetableTeacherRules).where(eq(timetableTeacherRules.centreId, centreOf(u, c)));
    return rows.map((r) => ({ facultyId: r.facultyId, maxPerDay: r.maxPerDay, maxPerWeek: r.maxPerWeek, offDays: JSON.parse(r.offDays || '[]'), blocked: JSON.parse(r.blocked || '[]') }));
  }
  @Put('rules') @Roles(...SETUP) async setRules(@CurrentUser() u: JwtUser, @Body() b: { rules: any[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const out: any[] = [];
    for (const r of b.rules || []) {
      if (!r?.facultyId) continue; const offDays = [...new Set((r.offDays || []).map((d: any) => int(d, 0, 6)).filter((d: number | null) => d !== null))]; const blocked = (r.blocked || []).map((x: any) => ({ weekday: int(x?.weekday, 0, 6), period: int(x?.period, 1, 40) })).filter((x: any) => x.weekday !== null && x.period !== null);
      const maxPerDay = int(r.maxPerDay, 1, 12), maxPerWeek = int(r.maxPerWeek, 1, 80); if (maxPerDay === null && maxPerWeek === null && !offDays.length && !blocked.length) continue;
      out.push({ centreId, facultyId: String(r.facultyId), maxPerDay, maxPerWeek, offDays: JSON.stringify(offDays), blocked: JSON.stringify(blocked) });
    }
    await db.transaction(async (tx: any) => { await tx.delete(timetableTeacherRules).where(eq(timetableTeacherRules.centreId, centreId)); if (out.length) await tx.insert(timetableTeacherRules).values(out); });
    return { ok: true, saved: out.length };
  }

  // ---------- the maker ----------
  /** Bell periods → teaching periods with a flag when a break comes right before. */
  private async teachingPeriods(centreId: string) {
    const all = await this.dbs.db.select().from(bellPeriods).where(eq(bellPeriods.centreId, centreId)).orderBy(asc(bellPeriods.no));
    const teach: Period[] = []; let brk = false; for (const p of all) { if (p.isBreak) { brk = true; continue; } teach.push({ no: p.no, startTime: p.startTime, endTime: p.endTime, breakBefore: brk && teach.length > 0 }); brk = false; }
    return { teach, all };
  }
  private async load(centreId: string, batchIds: string[], keepExisting: boolean) {
    const db = this.dbs.db; const { teach, all } = await this.teachingPeriods(centreId); if (!teach.length) throw new BadRequestException('Set up the bell timings first (Timetable → Bell timings).');
    const bs = await db.select({ id: batches.id, name: batches.name }).from(batches).where(eq(batches.centreId, centreId)); const bnames: Record<string, string> = {}; for (const x of bs) bnames[x.id] = x.name;
    const ids = (batchIds?.length ? batchIds : bs.map((x) => x.id)).filter((id) => bnames[id]);
    const staff = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.centreId, centreId)); const tnames: Record<string, string> = {}; for (const x of staff) tnames[x.id] = x.name;
    const reqRows = ids.length ? await db.select().from(timetableRequirements).where(and(eq(timetableRequirements.centreId, centreId), inArray(timetableRequirements.batchId, ids))) : [];
    const reqs: Req[] = reqRows.map((r) => ({ batchId: r.batchId, subject: r.subject, facultyId: r.facultyId, perWeek: r.perWeek, doubles: r.doubles, maxPerDay: r.maxPerDay }));
    const ruleRows = await db.select().from(timetableTeacherRules).where(eq(timetableTeacherRules.centreId, centreId)); const rules: Rule[] = ruleRows.map((r) => ({ facultyId: r.facultyId, maxPerDay: r.maxPerDay, maxPerWeek: r.maxPerWeek, offDays: JSON.parse(r.offDays || '[]'), blocked: JSON.parse(r.blocked || '[]') }));
    const slots = await db.select().from(timetableSlots).where(eq(timetableSlots.centreId, centreId));
    const sel = new Set(ids); const fixed: Cell[] = []; const busy: { facultyId: string; weekday: number; period: number }[] = []; const kept: typeof slots = [];
    for (const s of slots) {
      const mine = sel.has(s.batchId);
      if (mine && !keepExisting) continue; // will be replaced
      const hit = teach.filter((p) => ov(p, s));
      if (mine) { kept.push(s); for (const p of hit) fixed.push({ batchId: s.batchId, weekday: s.weekday, period: p.no, subject: s.subject, facultyId: s.facultyId }); }
      else if (s.facultyId) for (const p of hit) busy.push({ facultyId: s.facultyId, weekday: s.weekday, period: p.no });
    }
    return { teach, all, ids, bnames, tnames, reqs, rules, fixed, busy, slots, kept };
  }
  private auditAll(slots: AuditSlot[], rules: Rule[], all: { isBreak: boolean; startTime: string; endTime: string }[], bnames: Record<string, string>, tnames: Record<string, string>) { return audit(slots, rules, all.filter((p) => p.isBreak), { batch: bnames, teacher: tnames }); }

  /** Makes a timetable but saves nothing. */
  @Post('preview') @Roles(...SETUP) async preview(@CurrentUser() u: JwtUser, @Body() b: { days?: number[]; batchIds?: string[]; keepExisting?: boolean; seed?: number }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const days = [...new Set((b.days?.length ? b.days : [1, 2, 3, 4, 5, 6]).map((d) => int(d, 0, 6)).filter((d): d is number => d !== null))]; if (!days.length) throw new BadRequestException('Choose the working days');
    const L = await this.load(centreId, b.batchIds || [], !!b.keepExisting); if (!L.reqs.length) throw new BadRequestException('No class has subjects yet. Fill "Subjects per class" first.');
    const r = generate({ days, periods: L.teach, reqs: L.reqs, rules: L.rules, fixed: L.fixed, busy: L.busy, seed: b.seed, timeBudgetMs: 4000, names: { batch: L.bnames, teacher: L.tnames } });
    const pr = new Map(L.teach.map((p) => [p.no, p])); const withTimes = r.slots.map((s) => ({ ...s, startTime: pr.get(s.period)!.startTime, endTime: pr.get(s.period)!.endTime }));
    const sel = new Set(L.ids); const others = L.slots.filter((s) => !sel.has(s.batchId) || b.keepExisting);
    const problems = this.auditAll([...others.map((s) => ({ batchId: s.batchId, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, subject: s.subject, facultyId: s.facultyId, period: s.period })), ...withTimes.map((s) => ({ batchId: s.batchId, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, subject: s.subject, facultyId: s.facultyId, period: s.period }))], L.rules, L.all, L.bnames, L.tnames);
    return {
      days, seed: r.stats.seed, stats: r.stats, warnings: r.warnings, problems,
      slots: withTimes.map((s) => ({ ...s, batchName: L.bnames[s.batchId], teacherName: s.facultyId ? L.tnames[s.facultyId] || '' : '' })),
      kept: L.kept.map((s) => ({ batchId: s.batchId, weekday: s.weekday, period: s.period, subject: s.subject, facultyId: s.facultyId, startTime: s.startTime, endTime: s.endTime, batchName: L.bnames[s.batchId], teacherName: s.facultyId ? L.tnames[s.facultyId] || '' : '' })),
      unplaced: r.unplaced.map((x) => ({ ...x, batchName: L.bnames[x.batchId], teacherName: x.facultyId ? L.tnames[x.facultyId] || '' : '' })),
      periods: L.all.map((p) => ({ no: p.no, name: p.name, startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak })),
    };
  }

  /** Saves a previewed timetable. The server re-checks every rule first, so a wrong or stale preview can never create a clash. */
  @Post('apply') @Roles('SUPER_ADMIN', 'ADMIN') async apply(@CurrentUser() u: JwtUser, @Body() b: { batchIds: string[]; keepExisting?: boolean; slots: Cell[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const ids = [...new Set(b.batchIds || [])]; if (!ids.length) throw new BadRequestException('No classes chosen');
    const L = await this.load(centreId, ids, !!b.keepExisting); const pr = new Map(L.teach.map((p) => [p.no, p])); const allowed = new Set(L.ids);
    const fresh: Cell[] = []; for (const s of b.slots || []) { if (!allowed.has(s.batchId)) throw new BadRequestException('A lesson belongs to a class that is not selected'); const p = pr.get(Number(s.period)); if (!p) throw new BadRequestException('A lesson is in a break or a period that does not exist'); const wd = int(s.weekday, 0, 6); if (wd === null) throw new BadRequestException('Bad weekday'); if (!String(s.subject || '').trim()) throw new BadRequestException('A lesson has no subject'); fresh.push({ batchId: s.batchId, weekday: wd, period: p.no, subject: String(s.subject).trim().slice(0, 60), facultyId: s.facultyId || null }); }
    if (!fresh.length) throw new BadRequestException('Nothing to save');
    const sel = new Set(L.ids); const others = L.slots.filter((s) => !sel.has(s.batchId) || b.keepExisting);
    const asAudit = (x: Cell): AuditSlot => ({ batchId: x.batchId, weekday: x.weekday, startTime: pr.get(x.period)!.startTime, endTime: pr.get(x.period)!.endTime, subject: x.subject, facultyId: x.facultyId, period: x.period });
    const problems = this.auditAll([...others.map((s) => ({ batchId: s.batchId, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, subject: s.subject, facultyId: s.facultyId, period: s.period })), ...fresh.map(asAudit)], L.rules, L.all, L.bnames, L.tnames);
    if (problems.length) throw new BadRequestException(`Not saved: ${problems.slice(0, 5).join(' | ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`);
    await db.transaction(async (tx: any) => {
      if (!b.keepExisting) await tx.delete(timetableSlots).where(and(eq(timetableSlots.centreId, centreId), inArray(timetableSlots.batchId, L.ids)));
      await tx.insert(timetableSlots).values(fresh.map((s) => ({ centreId, batchId: s.batchId, facultyId: s.facultyId, weekday: s.weekday, startTime: pr.get(s.period)!.startTime, endTime: pr.get(s.period)!.endTime, subject: s.subject, period: s.period })));
    });
    return { ok: true, saved: fresh.length, classes: L.ids.length };
  }

  /** Looks for overlaps in the whole school's current timetable (teacher in two places, class with two lessons, lessons in a break, limits). */
  @Get('audit') @Roles(...SETUP) async auditNow(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const L = await this.load(centreId, [], true); const rows = L.slots;
    const problems = this.auditAll(rows.map((s) => ({ batchId: s.batchId, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, subject: s.subject, facultyId: s.facultyId, period: s.period })), L.rules, L.all, L.bnames, L.tnames);
    return { lessons: rows.length, problems };
  }
}
