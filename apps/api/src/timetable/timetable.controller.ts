import { Body, Controller, Delete, Get, Param, Post, Put, Query, BadRequestException, NotFoundException, SetMetadata } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, bellPeriods, facultyBatches, records, staffPermissions, substitutions, timetableSlots, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class SlotDto { @IsString() batchId: string; @IsInt() @Min(0) @Max(6) weekday: number; @Matches(/^\d\d:\d\d$/) startTime: string; @Matches(/^\d\d:\d\d$/) endTime: string; @IsString() subject: string; @IsOptional() @IsString() facultyId?: string; @IsOptional() @IsString() room?: string; }
class FacultyDto { @IsString() name: string; @IsString() mobile: string; @IsOptional() @IsString() email?: string; }
class FacultyBatchDto { @IsString() facultyId: string; @IsString() batchId: string; @IsOptional() @IsString() subject?: string; }

@Controller('timetable')
@Mod('timetable')
export class TimetableController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  @Get() list(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); return this.dbs.db.select().from(timetableSlots).where(batchId ? and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.batchId, batchId)) : eq(timetableSlots.centreId, centreId));
  }
  /** Adds a slot; refuses if the faculty or the batch already has a class overlapping that time. */
  @Post() @Roles('SUPER_ADMIN', 'ADMIN') async add(@CurrentUser() u: JwtUser, @Body() dto: SlotDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const same = await this.dbs.db.select().from(timetableSlots).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.weekday, dto.weekday)));
    const overlap = (s: typeof same[number]) => s.startTime < dto.endTime && dto.startTime < s.endTime;
    const clash = same.find((s) => overlap(s) && (s.batchId === dto.batchId || (dto.facultyId && s.facultyId === dto.facultyId)));
    if (clash) throw new BadRequestException(`Clashes with ${clash.subject} ${clash.startTime}–${clash.endTime} (${clash.batchId === dto.batchId ? 'same batch' : 'same faculty'})`);
    const [row] = await this.dbs.db.insert(timetableSlots).values({ ...dto, centreId }).returning(); return row;
  }
  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    await this.dbs.db.delete(timetableSlots).where(and(eq(timetableSlots.id, id), eq(timetableSlots.centreId, centreOf(u, c)))); return { ok: true };
  }

  @Get('faculty') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') faculty(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select({ id: users.id, name: users.name, mobile: users.mobile }).from(users).where(and(eq(users.centreId, centreOf(u, c)), eq(users.role, 'FACULTY')));
  }
  @Post('faculty') @Roles('SUPER_ADMIN', 'ADMIN') async addFaculty(@CurrentUser() u: JwtUser, @Body() dto: FacultyDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(users).values({ centreId: centreOf(u, c), name: dto.name, mobile: dto.mobile, email: dto.email?.trim().toLowerCase(), role: 'FACULTY' }).returning(); return row;
  }
  @Post('faculty-batch') @Roles('SUPER_ADMIN', 'ADMIN') async link(@CurrentUser() u: JwtUser, @Body() dto: FacultyBatchDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(facultyBatches).values({ ...dto, centreId: centreOf(u, c) }).returning(); return row;
  }

  // ================= Period grid (schools): bell schedule, class-wise weekly grid, teacher view, substitutions =================
  private overlap = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;
  private weekdayOf = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();

  @SetMetadata('module', '') @Get('periods') periods(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { return this.dbs.db.select().from(bellPeriods).where(eq(bellPeriods.centreId, centreOf(u, c))).orderBy(asc(bellPeriods.no)); }

  /** Replace the bell schedule. Slots already placed in the grid follow the new timings. */
  @Put('periods') @Roles('SUPER_ADMIN', 'ADMIN') async setPeriods(@CurrentUser() u: JwtUser, @Body() b: { periods: { no: number; name: string; startTime: string; endTime: string; isBreak?: boolean }[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const ps = (b.periods || []).map((p, i) => ({ no: Number(p.no) || i + 1, name: String(p.name || `Period ${i + 1}`).slice(0, 40), startTime: p.startTime, endTime: p.endTime, isBreak: !!p.isBreak }));
    if (!ps.length) throw new BadRequestException('Add at least one period');
    for (const p of ps) { if (!/^\d\d:\d\d$/.test(p.startTime) || !/^\d\d:\d\d$/.test(p.endTime) || p.startTime >= p.endTime) throw new BadRequestException(`${p.name}: start time must be before end time (HH:MM)`); }
    ps.sort((a, b2) => a.startTime.localeCompare(b2.startTime)); for (let i = 1; i < ps.length; i++) if (ps[i].startTime < ps[i - 1].endTime) throw new BadRequestException(`${ps[i].name} starts before ${ps[i - 1].name} ends`);
    ps.forEach((p, i) => (p.no = i + 1));
    await db.transaction(async (tx: any) => { await tx.delete(bellPeriods).where(eq(bellPeriods.centreId, centreId)); await tx.insert(bellPeriods).values(ps.map((p) => ({ ...p, centreId }))); for (const p of ps) await tx.update(timetableSlots).set({ startTime: p.startTime, endTime: p.endTime }).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.period, p.no))); });
    return this.periods(u, c);
  }

  /** One class's weekly grid: periods + every placed slot (with teacher name). */
  @SetMetadata('module', '') @Get('grid') async grid(@CurrentUser() u: JwtUser, @Query('batchId') batchId: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; if (!batchId) throw new BadRequestException('Choose a class');
    const periods = await db.select().from(bellPeriods).where(eq(bellPeriods.centreId, centreId)).orderBy(asc(bellPeriods.no));
    const slots = await db.select({ id: timetableSlots.id, weekday: timetableSlots.weekday, period: timetableSlots.period, startTime: timetableSlots.startTime, endTime: timetableSlots.endTime, subject: timetableSlots.subject, room: timetableSlots.room, facultyId: timetableSlots.facultyId, facultyName: users.name }).from(timetableSlots).leftJoin(users, eq(users.id, timetableSlots.facultyId)).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.batchId, batchId)));
    return { periods, slots };
  }

  /** Put (or clear, if subject is empty) one cell of the grid. Refuses double-booking of the class or the teacher. */
  @Post('grid/cell') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async cell(@CurrentUser() u: JwtUser, @Body() b: { batchId: string; weekday: number; periodNo: number; subject?: string; facultyId?: string; room?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [p] = await db.select().from(bellPeriods).where(and(eq(bellPeriods.centreId, centreId), eq(bellPeriods.no, b.periodNo))); if (!p) throw new BadRequestException('Set up the bell periods first');
    if (p.isBreak) throw new BadRequestException(`${p.name} is a break — no class can be placed`);
    const here = and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.batchId, b.batchId), eq(timetableSlots.weekday, b.weekday), eq(timetableSlots.period, b.periodNo)); const mine = new Set((await db.select({ id: timetableSlots.id }).from(timetableSlots).where(here)).map((x) => x.id));
    if (!b.subject?.trim()) { await db.delete(timetableSlots).where(here); return { ok: true, cleared: true }; }
    if (b.facultyId) { const clash = (await db.select().from(timetableSlots).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.weekday, b.weekday), eq(timetableSlots.facultyId, b.facultyId)))).find((s) => !mine.has(s.id) && this.overlap(s, p)); if (clash) { const [bt] = await db.select({ n: batches.name }).from(batches).where(eq(batches.id, clash.batchId)); throw new BadRequestException(`This teacher already has ${clash.subject} with ${bt?.n || 'another class'} at that time`); } }
    await db.delete(timetableSlots).where(here); // only now that the new lesson is known to be allowed
    const [row] = await db.insert(timetableSlots).values({ centreId, batchId: b.batchId, weekday: b.weekday, startTime: p.startTime, endTime: p.endTime, subject: b.subject.trim(), facultyId: b.facultyId || null, room: b.room || null, period: b.periodNo } as any).returning(); return row;
  }

  /** A teacher's own week plus the substitutions given to them in the next two weeks. */
  @SetMetadata('module', '') @Get('mine') async mine(@CurrentUser() u: JwtUser) {
    const db = this.dbs.db; if (!u.centreId) return { slots: [], substitutions: [] };
    const slots = await db.select({ id: timetableSlots.id, weekday: timetableSlots.weekday, period: timetableSlots.period, startTime: timetableSlots.startTime, endTime: timetableSlots.endTime, subject: timetableSlots.subject, room: timetableSlots.room, batch: batches.name }).from(timetableSlots).innerJoin(batches, eq(batches.id, timetableSlots.batchId)).where(and(eq(timetableSlots.centreId, u.centreId), eq(timetableSlots.facultyId, u.id))).orderBy(asc(timetableSlots.weekday), asc(timetableSlots.startTime));
    const today = new Date().toISOString().slice(0, 10); const end = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const subs = await db.select({ id: substitutions.id, date: substitutions.date, startTime: substitutions.startTime, endTime: substitutions.endTime, subject: substitutions.subject, note: substitutions.note, batch: batches.name }).from(substitutions).innerJoin(batches, eq(batches.id, substitutions.batchId)).where(and(eq(substitutions.centreId, u.centreId), eq(substitutions.substituteFacultyId, u.id), gte(substitutions.date, today), lte(substitutions.date, end))).orderBy(asc(substitutions.date));
    return { slots, substitutions: subs };
  }

  @Get('teacher-load') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async load(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const slots = await db.select().from(timetableSlots).where(and(eq(timetableSlots.centreId, centreId)));
    const staff = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'FACULTY')));
    return staff.map((t) => { const mine = slots.filter((s) => s.facultyId === t.id); return { id: t.id, name: t.name, periodsPerWeek: mine.length, perDay: [0, 1, 2, 3, 4, 5, 6].map((d) => mine.filter((s) => s.weekday === d).length) }; }).sort((a, b) => b.periodsPerWeek - a.periodsPerWeek);
  }

  private async freeTeachers(centreId: string, date: string, slot: { startTime: string; endTime: string }, excludeId?: string | null) {
    const db = this.dbs.db; const wd = this.weekdayOf(date);
    const staff = await db.select({ id: users.id, name: users.name, active: staffPermissions.active }).from(users).leftJoin(staffPermissions, eq(staffPermissions.userId, users.id)).where(and(eq(users.centreId, centreId), eq(users.role, 'FACULTY')));
    const day = await db.select().from(timetableSlots).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.weekday, wd)));
    const subs = await db.select().from(substitutions).where(and(eq(substitutions.centreId, centreId), eq(substitutions.date, date)));
    const leaves = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'staff-leave'), eq(records.status, 'approved')));
    const onLeave = new Set(leaves.filter((l) => l.date && l.date <= date && ((JSON.parse(l.data).toDate || l.date) >= date)).map((l) => l.staffId));
    return staff.filter((t) => t.active !== false && t.id !== excludeId && !onLeave.has(t.id) && !day.some((s) => s.facultyId === t.id && this.overlap(s, slot)) && !subs.some((x) => x.substituteFacultyId === t.id && this.overlap(x, slot)))
      .map((t) => ({ id: t.id, name: t.name, periodsThatDay: day.filter((s) => s.facultyId === t.id).length + subs.filter((x) => x.substituteFacultyId === t.id).length })).sort((a, b) => a.periodsThatDay - b.periodsThatDay);
  }

  @SetMetadata('module', '') @Get('substitutions') async subs(@CurrentUser() u: JwtUser, @Query('date') date: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const d = date || new Date().toISOString().slice(0, 10);
    const rows = await this.dbs.db.select().from(substitutions).where(and(eq(substitutions.centreId, centreId), eq(substitutions.date, d))).orderBy(asc(substitutions.startTime));
    const ids = [...new Set(rows.flatMap((r) => [r.originalFacultyId, r.substituteFacultyId]).filter(Boolean) as string[])]; const names = ids.length ? await this.dbs.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : [];
    const bs = await this.dbs.db.select({ id: batches.id, name: batches.name }).from(batches).where(eq(batches.centreId, centreId)); const nm = (id?: string | null) => names.find((n) => n.id === id)?.name || '';
    return rows.map((r) => ({ ...r, batch: bs.find((b) => b.id === r.batchId)?.name || '', originalName: nm(r.originalFacultyId), substituteName: nm(r.substituteFacultyId) }));
  }

  /** Periods on this date whose teacher is on approved leave and still has no substitute, with free teachers to pick from. */
  @Get('substitutions/needed') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async needed(@CurrentUser() u: JwtUser, @Query('date') date: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const d = date || new Date().toISOString().slice(0, 10); const wd = this.weekdayOf(d);
    const leaves = (await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'staff-leave'), eq(records.status, 'approved')))).filter((l) => l.date && l.date <= d && ((JSON.parse(l.data).toDate || l.date) >= d));
    const away = leaves.map((l) => l.staffId).filter(Boolean) as string[]; if (!away.length) return [];
    const slots = await db.select({ s: timetableSlots, batch: batches.name, teacher: users.name }).from(timetableSlots).innerJoin(batches, eq(batches.id, timetableSlots.batchId)).leftJoin(users, eq(users.id, timetableSlots.facultyId)).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.weekday, wd), inArray(timetableSlots.facultyId, away))).orderBy(asc(timetableSlots.startTime));
    const done = await db.select().from(substitutions).where(and(eq(substitutions.centreId, centreId), eq(substitutions.date, d))); const out: any[] = [];
    for (const r of slots) { if (done.some((x) => x.slotId === r.s.id)) continue; out.push({ slotId: r.s.id, startTime: r.s.startTime, endTime: r.s.endTime, subject: r.s.subject, batch: r.batch, absentTeacher: r.teacher, free: (await this.freeTeachers(centreId, d, r.s, r.s.facultyId)).slice(0, 6) }); }
    return out;
  }

  @Get('substitutions/free') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async free(@CurrentUser() u: JwtUser, @Query('date') date: string, @Query('slotId') slotId: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const [s] = await this.dbs.db.select().from(timetableSlots).where(and(eq(timetableSlots.id, slotId), eq(timetableSlots.centreId, centreId))); if (!s) throw new NotFoundException(); return this.freeTeachers(centreId, date, s, s.facultyId);
  }

  @Post('substitutions') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async substitute(@CurrentUser() u: JwtUser, @Body() b: { date: string; slotId: string; substituteFacultyId: string; note?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; if (!/^\d{4}-\d\d-\d\d$/.test(b.date || '')) throw new BadRequestException('Choose a date');
    const [s] = await db.select().from(timetableSlots).where(and(eq(timetableSlots.id, b.slotId), eq(timetableSlots.centreId, centreId))); if (!s) throw new NotFoundException('Period not found');
    if (this.weekdayOf(b.date) !== s.weekday) throw new BadRequestException('That period is not held on this weekday');
    if (s.facultyId === b.substituteFacultyId) throw new BadRequestException('Choose a different teacher');
    if (await db.select().from(substitutions).where(and(eq(substitutions.slotId, s.id), eq(substitutions.date, b.date))).then((r) => r.length)) throw new BadRequestException('A substitute is already assigned for this period');
    const free = await this.freeTeachers(centreId, b.date, s, s.facultyId); const pick = free.find((t) => t.id === b.substituteFacultyId); if (!pick) throw new BadRequestException('That teacher is not free in this period (class, leave or another substitution)');
    const [row] = await db.insert(substitutions).values({ centreId, date: b.date, slotId: s.id, batchId: s.batchId, originalFacultyId: s.facultyId, substituteFacultyId: b.substituteFacultyId, startTime: s.startTime, endTime: s.endTime, subject: s.subject, note: b.note || null, createdBy: u.id }).returning();
    const [bt] = await db.select({ n: batches.name }).from(batches).where(eq(batches.id, s.batchId));
    this.notify.notifyUsers(centreId, [b.substituteFacultyId], 'Substitution duty', `${new Date(b.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${s.startTime}–${s.endTime} · ${bt?.n || ''} · ${s.subject}`, { urgent: true }); return row;
  }
  @Delete('substitutions/:id') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async unsub(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) { await this.dbs.db.delete(substitutions).where(and(eq(substitutions.id, id), eq(substitutions.centreId, centreOf(u, c)))); return { ok: true }; }
}
