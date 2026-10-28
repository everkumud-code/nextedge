import { Body, Controller, Delete, Get, Param, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, facultyBatches, students, timetableSlots, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class BatchDto { @IsString() name: string; @IsString() course: string; @IsOptional() @IsInt() capacity?: number; @IsOptional() @IsString() startDate?: string; @IsOptional() @IsString() endDate?: string; }
class UpdateDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() course?: string; @IsOptional() @IsInt() capacity?: number; @IsOptional() @IsString() startDate?: string; @IsOptional() @IsString() endDate?: string; @IsOptional() @IsBoolean() archived?: boolean; }
class FacultyDto { @IsString() facultyId: string; @IsOptional() @IsString() subject?: string; }

/** Batches with student count, teachers and timetable slots. Staff/teachers see the list; only owners change it. */
@Controller('batches')
@Mod('students')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF')
export class BatchesController {
  constructor(private dbs: DbService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('all') all?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const rows = await db.select().from(batches).where(eq(batches.centreId, centreId)).orderBy(batches.name);
    if (!rows.length) return [];
    const ids = rows.map((b) => b.id);
    const counts = await db.select({ batchId: students.batchId, n: sql<number>`count(*)` }).from(students).where(and(inArray(students.batchId, ids), eq(students.active, true))).groupBy(students.batchId);
    const fac = await db.select({ batchId: facultyBatches.batchId, facultyId: facultyBatches.facultyId, subject: facultyBatches.subject, name: users.name }).from(facultyBatches).innerJoin(users, eq(users.id, facultyBatches.facultyId)).where(inArray(facultyBatches.batchId, ids));
    const slots = await db.select({ batchId: timetableSlots.batchId, n: sql<number>`count(*)` }).from(timetableSlots).where(inArray(timetableSlots.batchId, ids)).groupBy(timetableSlots.batchId);
    const out = rows.map((b) => ({ ...b, students: Number(counts.find((x) => x.batchId === b.id)?.n || 0), faculty: fac.filter((f) => f.batchId === b.id).map(({ facultyId, name, subject }) => ({ facultyId, name, subject })), slots: Number(slots.find((x) => x.batchId === b.id)?.n || 0), archived: !!(b.endDate && b.endDate < new Date().toISOString().slice(0, 10)) }));
    return all === '1' ? out : out.filter((b) => !b.archived);
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN')
  async create(@CurrentUser() u: JwtUser, @Body() dto: BatchDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(batches).values({ ...dto, centreId: centreOf(u, c) }).returning(); return row;
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

  /** Move students between batches (bulk). */
  @Post(':id/move') @Roles('SUPER_ADMIN', 'ADMIN')
  async move(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { studentIds: string[] }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); if (!b.studentIds?.length) return { moved: 0 };
    const r = await this.dbs.db.update(students).set({ batchId: id }).where(and(inArray(students.id, b.studentIds), eq(students.centreId, centreId))).returning({ id: students.id }); return { moved: r.length };
  }
}
