import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsOptional, IsString, Length } from 'class-validator';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { StudentsService } from './students.service';
import { IsArray } from 'class-validator';

class ImportDto { @IsArray() rows: any[]; @IsOptional() @IsString() batchId?: string; }

class StudentDto {
  @IsString() name: string;
  @IsString() @Length(10, 10) parentMobile: string;
  @IsOptional() @IsString() parentName?: string;
  @IsOptional() @IsString() parentEmail?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() className?: string;
  @IsOptional() @IsString() rollNo?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() gender?: string; @IsOptional() @IsString() admissionNo?: string; @IsOptional() @IsString() admissionDate?: string; @IsOptional() @IsString() fatherName?: string; @IsOptional() @IsString() motherName?: string; @IsOptional() @IsString() address?: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() religion?: string; @IsOptional() @IsString() bloodGroup?: string; @IsOptional() @IsString() previousSchool?: string; @IsOptional() @IsString() photoUrl?: string;
  @IsOptional() @IsString() leftOn?: string; @IsOptional() @IsString() leftReason?: string; @IsOptional() active?: boolean;
}

@Controller('students')
@Mod('students')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF')
export class StudentsController {
  constructor(private dbs: DbService, private svc: StudentsService) {}

  @Get() list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('batchId') batchId?: string) {
    const centreId = centreOf(u, c);
    const where = batchId ? and(eq(students.centreId, centreId), eq(students.batchId, batchId)) : eq(students.centreId, centreId);
    return this.dbs.db.select().from(students).where(where).orderBy(students.name);
  }

  /** Data for printable ID cards (QR = student id, scanned at the gate). */
  @Get('id-cards') @Roles('SUPER_ADMIN', 'ADMIN') async idCards(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const rows = await this.list(u, c, batchId); return rows.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, rollNo: r.rollNo, className: r.className, batchId: r.batchId, parentMobile: r.parentMobile, qr: r.id }));
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN')
  create(@CurrentUser() u: JwtUser, @Body() dto: StudentDto, @Query('centreId') c?: string) {
    return this.svc.create(centreOf(u, c), dto);
  }

  /** Bulk import: body.rows = [{name, rollNo, className, parentName, parentMobile, mobile, batchId?}] parsed from Excel by the admin panel. */
  @Post('import') @Roles('SUPER_ADMIN', 'ADMIN')
  import(@CurrentUser() u: JwtUser, @Body() dto: ImportDto, @Query('centreId') c?: string) {
    return this.svc.import(centreOf(u, c), dto.rows, dto.batchId);
  }

  @Put(':id') @Roles('SUPER_ADMIN', 'ADMIN')
  async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: Partial<StudentDto>, @Query('centreId') c?: string) {
    const { parentEmail, email, ...rest } = dto as any; const set: any = { ...rest }; Object.keys(set).forEach((k) => set[k] === '' && (set[k] = null)); if (rest.name === null) delete set.name; if (rest.parentMobile === null) delete set.parentMobile;
    if (rest.batchId) { const [b] = await this.dbs.db.select({ name: batches.name, className: batches.className }).from(batches).where(eq(batches.id, rest.batchId)); if (b) set.className = b.className || b.name; }
    const [row] = await this.dbs.db.update(students).set(set).where(and(eq(students.id, id), eq(students.centreId, centreOf(u, c)))).returning();
    if (row?.userId && (rest.name || email)) { const upd: any = {}; if (rest.name) upd.name = rest.name; if (email) upd.email = String(email).trim().toLowerCase(); await this.dbs.db.update(users).set(upd).where(eq(users.id, row.userId)); }
    if (parentEmail) await this.dbs.db.update(users).set({ email: String(parentEmail).trim().toLowerCase() }).where(and(eq(users.centreId, row.centreId), eq(users.mobile, row.parentMobile), eq(users.role, 'PARENT')));
    return row;
  }

  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN')
  async deactivate(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    await this.dbs.db.update(students).set({ active: false }).where(and(eq(students.id, id), eq(students.centreId, centreOf(u, c))));
    return { ok: true };
  }
}
