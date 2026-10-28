import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { enquiries, students } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { StudentsService } from '../students/students.service';

const STATUSES = ['new', 'contacted', 'demo', 'admitted', 'lost'];
class EnqDto { @IsString() name: string; @IsString() @Length(10, 10) mobile: string; @IsOptional() @IsString() className?: string; @IsOptional() @IsString() course?: string; @IsOptional() @IsIn(['walk-in', 'phone', 'website', 'referral', 'social']) source?: string; @IsOptional() @IsString() notes?: string; @IsOptional() @IsString() nextFollowUp?: string; }
class UpdDto { @IsOptional() @IsIn(STATUSES) status?: string; @IsOptional() @IsString() notes?: string; @ValidateIf((o) => o.nextFollowUp !== null && o.nextFollowUp !== undefined) @IsString() nextFollowUp?: string | null; @IsOptional() @IsString() assignedTo?: string; }

/** Enquiry register: walk-ins and calls → follow-ups → admission (one click creates the student). */
@Controller('enquiries')
@Mod('enquiries')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
export class EnquiriesController {
  constructor(private dbs: DbService, private studentsSvc: StudentsService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('status') status?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const where = status ? and(eq(enquiries.centreId, centreId), eq(enquiries.status, status)) : eq(enquiries.centreId, centreId);
    const rows = await this.dbs.db.select().from(enquiries).where(where).orderBy(desc(enquiries.updatedAt)).limit(500);
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    return rows.map((r) => ({ ...r, followUpDue: !!r.nextFollowUp && r.nextFollowUp <= today && !['admitted', 'lost'].includes(r.status) }));
  }

  @Get('summary') async summary(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const rows = await this.dbs.db.select({ status: enquiries.status, source: enquiries.source, n: sql<number>`count(*)` }).from(enquiries).where(eq(enquiries.centreId, centreId)).groupBy(enquiries.status, enquiries.source);
    const byStatus: Record<string, number> = {}; const bySource: Record<string, number> = {};
    rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + Number(r.n); bySource[r.source] = (bySource[r.source] || 0) + Number(r.n); });
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, byStatus, bySource, conversion: total ? Math.round(((byStatus.admitted || 0) / total) * 100) : 0 };
  }

  @Post() async create(@CurrentUser() u: JwtUser, @Body() dto: EnqDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(enquiries).values({ ...dto, centreId: centreOf(u, c), assignedTo: u.id }).returning(); return row;
  }

  @Put(':id') async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.update(enquiries).set({ ...dto, updatedAt: new Date() } as any).where(and(eq(enquiries.id, id), eq(enquiries.centreId, centreOf(u, c)))).returning(); return row;
  }

  /** Convert to admission: creates the student (parent login auto-created) and marks the enquiry admitted. */
  @Post(':id/admit') async admit(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { batchId?: string; parentName?: string; rollNo?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [e] = await this.dbs.db.select().from(enquiries).where(and(eq(enquiries.id, id), eq(enquiries.centreId, centreId))); if (!e) return null;
    const st = await this.studentsSvc.create(centreId, { name: e.name, parentMobile: e.mobile, parentName: b?.parentName, className: e.className || undefined, rollNo: b?.rollNo, batchId: b?.batchId || null });
    await this.dbs.db.update(enquiries).set({ status: 'admitted', updatedAt: new Date() }).where(eq(enquiries.id, id));
    return st;
  }
}
