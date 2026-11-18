import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { cleanId } from '../insights/compliance';
import { BadRequestException } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, loginLog, students, users } from '../db/schema';
import { RedisService } from '../common/redis.service';
import { cleanMobile, issueParentCode, parentCodeMessage } from '../common/parent-code';
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
  @IsOptional() @IsString() gender?: string; @IsOptional() @IsString() admissionNo?: string; @IsOptional() @IsString() admissionDate?: string; @IsOptional() @IsString() fatherName?: string; @IsOptional() @IsString() motherName?: string; @IsOptional() @IsString() address?: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() religion?: string; @IsOptional() @IsString() bloodGroup?: string; @IsOptional() @IsString() previousSchool?: string; @IsOptional() @IsString() photoUrl?: string; @IsOptional() @IsString() apaarId?: string; @IsOptional() @IsString() pen?: string; @IsOptional() @IsBoolean() photoConsent?: boolean; @IsOptional() @IsString() houseId?: string;
  @IsOptional() @IsString() leftOn?: string; @IsOptional() @IsString() leftReason?: string; @IsOptional() active?: boolean;
}

class UpdateStudentDto {
  @IsOptional() @IsString() name?: string; @IsOptional() @IsString() parentName?: string; @IsOptional() @IsString() parentMobile?: string; @IsOptional() @IsString() parentEmail?: string; @IsOptional() @IsString() email?: string; @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() className?: string; @IsOptional() @IsString() rollNo?: string; @IsOptional() @IsString() batchId?: string; @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() gender?: string; @IsOptional() @IsString() admissionNo?: string; @IsOptional() @IsString() admissionDate?: string; @IsOptional() @IsString() fatherName?: string; @IsOptional() @IsString() motherName?: string; @IsOptional() @IsString() address?: string; @IsOptional() @IsString() category?: string; @IsOptional() @IsString() religion?: string; @IsOptional() @IsString() bloodGroup?: string; @IsOptional() @IsString() previousSchool?: string; @IsOptional() @IsString() photoUrl?: string; @IsOptional() @IsString() apaarId?: string; @IsOptional() @IsString() pen?: string; @IsOptional() @IsBoolean() photoConsent?: boolean; @IsOptional() @IsString() houseId?: string;
  @IsOptional() @IsString() leftOn?: string; @IsOptional() @IsString() leftReason?: string; @IsOptional() @IsBoolean() active?: boolean;
}

@Controller('students')
@Mod('students')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF')
export class StudentsController {
  constructor(private dbs: DbService, private svc: StudentsService, private redis: RedisService) {}

  @Get() list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string, @Query('batchId') batchId?: string) {
    const centreId = centreOf(u, c);
    const where = batchId ? and(eq(students.centreId, centreId), eq(students.batchId, batchId)) : eq(students.centreId, centreId);
    return this.dbs.db.select().from(students).where(where).orderBy(students.name);
  }

  /** Data for printable ID cards (QR = student id, scanned at the gate). */
  @Get('id-cards') @Roles('SUPER_ADMIN', 'ADMIN') async idCards(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const rows = await this.list(u, c, batchId); return rows.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name, rollNo: r.rollNo, className: r.className, batchId: r.batchId, parentMobile: r.parentMobile, qr: r.id }));
  }

  /**
   * The office gives parents a login code (the school's own way in, no SMS provider needed): for one student, several, or a whole class.
   * Body: { studentIds?: string[], batchId? }. Brothers and sisters share one parent, so one code covers all of them.
   */
  @Post('parent-codes') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  async parentCodes(@CurrentUser() u: JwtUser, @Body() b: { studentIds?: string[]; batchId?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    let rows = (await this.list(u, c, b?.batchId)).filter((r) => r.active);
    if (Array.isArray(b?.studentIds) && b.studentIds.length) rows = rows.filter((r) => b.studentIds!.includes(r.id));
    if (!rows.length) throw new BadRequestException('Choose a student or a class first.');
    const parents = new Map<string, { mobile: string; parentName: string; children: string[] }>();
    for (const r of rows) {
      const mobile = cleanMobile(r.parentMobile); if (mobile.length !== 10) continue;
      const p = parents.get(mobile) || { mobile, parentName: r.parentName || 'Parent', children: [] }; p.children.push(r.name); parents.set(mobile, p);
    }
    if (!parents.size) throw new BadRequestException('These students have no valid parent mobile number. Add it to the student first.');
    if (parents.size > 500) throw new BadRequestException('Choose a smaller group (up to 500 parents at a time).');
    const [ce] = await this.dbs.db.select({ name: centres.name, slug: centres.slug }).from(centres).where(eq(centres.id, centreId));
    const domain = (process.env.WORKSPACE_DOMAIN || '').trim(); const link = ce?.slug && domain ? `https://${ce.slug}.${domain}` : (process.env.PUBLIC_API_URL || 'https://nextedge.nextsoftwares.in');
    const out: any[] = [];
    for (const p of parents.values()) {
      await this.svc.ensureUser(centreId, p.mobile, p.parentName, 'PARENT');
      const code = await issueParentCode(this.redis, centreId, p.mobile);
      out.push({ ...p, code, message: parentCodeMessage(ce?.name || 'School', link, p.mobile, code) });
    }
    // only the fact that codes were issued is recorded, never the codes themselves
    this.dbs.db.insert(loginLog).values({ centreId, userId: u.id, name: u.name, role: u.role, channel: 'code-issued', ok: true, note: `${out.length} parent code(s)` }).catch(() => {});
    return { school: ce?.name || '', link, validHours: 24, parents: out };
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
  async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdateStudentDto, @Query('centreId') c?: string) {
    const { parentEmail, email, ...rest } = dto as any; const set: any = { ...rest }; try { if ('apaarId' in rest) set.apaarId = cleanId('APAAR', rest.apaarId); if ('pen' in rest) set.pen = cleanId('PEN', rest.pen); } catch (e: any) { throw new BadRequestException(e.message); } Object.keys(set).forEach((k) => set[k] === '' && (set[k] = null)); if (set.name === null) delete set.name; if (set.parentMobile === null) delete set.parentMobile;
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
