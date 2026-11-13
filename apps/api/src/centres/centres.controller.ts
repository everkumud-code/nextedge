import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, Length, IsIn } from 'class-validator';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, students, users } from '../db/schema';
import { featuresFor } from '../common/permissions';
import { PLAN_PRESETS, PlatformService } from '../platform/platform.service';
import { WorkspaceService, workspaceDomain } from '../workspaces/workspaces.controller';
import { Roles } from '../common/auth.guard';

class CentreDto { @IsOptional() @IsString() slug?: string; @IsString() name: string; @IsOptional() @IsString() city?: string; @IsOptional() @IsString() plan?: string; @IsString() adminName: string; @IsString() @Length(10, 10) adminMobile: string; @IsOptional() @IsString() adminEmail?: string; @IsOptional() @IsIn(['coaching', 'school']) institutionType?: string; }

@Controller('centres')
@Roles('SUPER_ADMIN')
export class CentresController {
  constructor(private dbs: DbService, private platform: PlatformService, private ws: WorkspaceService) {}
  @Get() async list() {
    const db = this.dbs.db;
    const rows = await db.select({ id: centres.id, name: centres.name, city: centres.city, plan: centres.plan, createdAt: centres.createdAt, students: sql<number>`(select count(*) from ${students} where ${students.centreId} = ${centres.id} and ${students.active})` }).from(centres);
    return rows.map((r) => ({ ...r, students: Number(r.students) }));
  }
  /** Onboard a centre with its first admin in one call. */
  @Post() async create(@Body() dto: CentreDto) {
    const type = dto.institutionType === 'school' ? 'school' : 'coaching';
    const plan = dto.plan && PLAN_PRESETS[dto.plan] ? dto.plan : 'pro'; const demo = plan === 'demo';
    const slug = await this.ws.freeSlug(dto.name, dto.slug?.trim().toLowerCase() || undefined);
    const [c] = await this.dbs.db.insert(centres).values({ name: dto.name, city: dto.city, plan, institutionType: type, slug }).returning();
    await this.dbs.db.insert(centreSettings).values({ centreId: c.id, features: JSON.stringify(featuresFor(type, plan)), ...(demo ? { status: 'active', pricePerStudent: '0', minStudents: 0 } : { trialEndsAt: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), ...(await this.platform.packSettings(plan)) }) }).onConflictDoNothing();
    const [admin] = await this.dbs.db.insert(users).values({ centreId: c.id, name: dto.adminName, mobile: dto.adminMobile, email: dto.adminEmail?.trim().toLowerCase(), role: 'ADMIN' }).returning();
    return { centre: c, admin, address: `${slug}.${workspaceDomain()}` };
  }
}
