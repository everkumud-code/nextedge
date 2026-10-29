import { Body, Controller, Delete, Get, Param, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, facultyBatches, students, timetableSlots, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class BatchDto { @IsString() name: string; @IsOptional() @IsString() course?: string; @IsOptional() @IsString() className?: string; @IsOptional() @IsString() section?: string; @IsOptional() @IsString() classTeacherId?: string; @IsOptional() @IsInt() capacity?: number; @IsOptional() @IsString() startDate?: string; @IsOptional() @IsString() endDate?: string; }
class UpdateDto { @IsOptional() @IsString() className?: string; @IsOptional() @IsString() section?: string; @IsOptional() @IsString() classTeacherId?: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsString() course?: string; @IsOptional() @IsInt() capacity?: number; @IsOptional() @IsString() startDate?: string; @IsOptional() @IsString() endDate?: string; @IsOptional() @IsBoolean() archived?: boolean; }
class FacultyDto { @IsString() facultyId: string; @IsOptional() @IsString() subject?: string; }

/** Batches with student count, teachers and timetable slots. Staff/teachers see the list; only owners change it. */
@Controller('batches')
@Mod('students')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF')
export class BatchesController {
  constructor(private dbs: DbService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('all') all?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const rows = await db.select().from(batches).where(eq(batches.centreId, centreId)).orderBy(batches.sortOrder, batches.name);
    const ctIds = rows.map((b) => b.classTeacherId).filter((x): x is string => !!x); const cts = ctIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ctIds)) : [];
    if (!rows.length) return [];
    const ids = rows.map((b) => b.id);
    const counts = await db.select({ batchId: students.batchId, n: sql<number>`count(*)` }).from(students).where(and(inArray(students.batchId, ids), eq(students.active, true))).groupBy(students.batchId);
    const fac = await db.select({ batchId: facultyBatches.batchId, facultyId: facultyBatches.facultyId, subject: facultyBatches.subject, name: users.name }).from(facultyBatches).innerJoin(users, eq(users.id, facultyBatches.facultyId)).where(inArray(facultyBatches.batchId, ids));
    const slots = await db.select({ batchId: timetableSlots.batchId, n: sql<number>`count(*)` }).from(timetableSlots).where(inArray(timetableSlots.batchId, ids)).groupBy(timetableSlots.batchId);
    const out = rows.map((b) => ({ ...b, students: Number(counts.find((x) => x.batchId === b.id)?.n || 0), faculty: fac.filter((f) => f.batchId === b.id).map(({ facultyId, name, subject }) => ({ facultyId, name, subject })), slots: Number(slots.find((x) => x.batchId === b.id)?.n || 0), classTeacher: cts.find((x) => x.id === b.classTeacherId)?.name || null, archived: !!(b.endDate && b.endDate < new Date().toISOString().slice(0, 10)) }));
    return all === '1' ? out : out.filter((b) => !b.archived);
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN')
  async create(@CurrentUser() u: JwtUser, @Body() dto: BatchDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(batches).values({ ...dto, course: dto.course || dto.className || dto.name, centreId: centreOf(u, c) }).returning(); return row;
  }

  @Put(':id') @Roles('SUPER_ADMIN', 'ADMIN')
  async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdateDto, @Query('centreId') c?: string) {
    const { archived, ...rest } = dto; const set: any = { ...rest };
    if (archived === true) set.endDate = new Date(Date.now() - 864e5).toISOString().slice(0, 10); if (archived === false) set.endDate = null;
    const [row] = await this.dbs.db.update(batches).set(set).where(and(eq(batches.id, id), eq(batches.centreId, centreOf(u, c)))).returning(); if (!row) throw new BadRequestException('Batch not found'); return row;
  }

  /** Assign / remove a teacher. */
  @Post(':id/faculty') @Roles('SUPER_ADMIN', 'ADMIN')
  async addFaculty(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: FacultyDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const [f] = await this.dbs.db.select().from(users).where(and(eq(users.id, dto.facultyId), eq(users.centreId, centreId))); if (!f) throw new BadRequestException('Teacher not found');
    const dup = await this.dbs.db.select({ id: facultyBatches.id }).from(facultyBatches).where(and(eq(facultyBatches.batchId, id), eq(facultyBatches.facultyId, dto.facultyId))); if (!dup.length) await this.dbs.db.insert(facultyBatches).values({ centreId, batchId: id, facultyId: dto.facultyId, subject: dto.subject }); return { ok: true };
  }
  @Delete(':id/faculty/:facultyId') @Roles('SUPER_ADMIN', 'ADMIN')
  async removeFaculty(@Param('id') id: string, @Param('facultyId') facultyId: string) { await this.dbs.db.delete(facultyBatches).where(and(eq(facultyBatches.batchId, id), eq(facultyBatches.facultyId, facultyId))); return { ok: true }; }

  /** School: create Class × Sections in one go. body: { classes: ['1','2','3'] or 'Nursery', sections: ['A','B','C','D'], capacity, prefix: 'Class' } → "Class 1 - A" … */
  @Post('bulk-classes') @Roles('SUPER_ADMIN', 'ADMIN')
  async bulkClasses(@CurrentUser() u: JwtUser, @Body() b: { classes: string[]; sections: string[]; capacity?: number; prefix?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const existing = await db.select({ name: batches.name }).from(batches).where(eq(batches.centreId, centreId)); const have = new Set(existing.map((e) => e.name));
    const prefix = b.prefix === undefined ? 'Class' : b.prefix; let created = 0, skipped = 0, order = 0;
    for (const cl of b.classes || []) for (const sec of (b.sections?.length ? b.sections : [''])) {
      const className = `${prefix ? prefix + ' ' : ''}${cl}`.trim(); const name = sec ? `${className} - ${sec}` : className; order++;
      if (have.has(name)) { skipped++; continue; }
      await db.insert(batches).values({ centreId, name, course: className, className, section: sec || null, capacity: b.capacity || 40, sortOrder: (Number(cl) || order) * 10 + (sec ? sec.charCodeAt(0) - 64 : 0) }); created++;
    }
    return { created, skipped };
  }

  /** Promotion: move every active student of one section to another (except detained ids); toBatchId null = passed out (marked left, kept for records/TC). */
  @Post('promote') @Roles('SUPER_ADMIN', 'ADMIN')
  async promote(@CurrentUser() u: JwtUser, @Body() b: { fromBatchId: string; toBatchId?: string | null; detainIds?: string[]; leftReason?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const sts = await db.select({ id: students.id }).from(students).where(and(eq(students.centreId, centreId), eq(students.batchId, b.fromBatchId), eq(students.active, true)));
    const move = sts.map((s) => s.id).filter((id) => !(b.detainIds || []).includes(id)); if (!move.length) return { moved: 0, detained: sts.length };
    if (b.toBatchId) { const [to] = await db.select({ name: batches.name, className: batches.className }).from(batches).where(and(eq(batches.id, b.toBatchId), eq(batches.centreId, centreId))); if (!to) throw new BadRequestException('Target class not found'); await db.update(students).set({ batchId: b.toBatchId, className: to.className || to.name }).where(inArray(students.id, move)); }
    else await db.update(students).set({ active: false, leftOn: new Date().toISOString().slice(0, 10), leftReason: b.leftReason || 'Passed out' }).where(inArray(students.id, move));
    return { moved: move.length, detained: sts.length - move.length };
  }

  /** Move students between batches (bulk). */
  @Post(':id/move') @Roles('SUPER_ADMIN', 'ADMIN')
  async move(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { studentIds: string[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); if (!b.studentIds?.length) return { moved: 0 };
    const r = await this.dbs.db.update(students).set({ batchId: id }).where(and(inArray(students.id, b.studentIds), eq(students.centreId, centreId))).returning({ id: students.id }); return { moved: r.length };
  }
}
