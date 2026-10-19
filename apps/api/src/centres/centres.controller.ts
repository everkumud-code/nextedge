import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsOptional, IsString, Length } from 'class-validator';
import { eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';

class CentreDto { @IsString() name: string; @IsOptional() @IsString() city?: string; @IsOptional() @IsString() plan?: string; @IsString() adminName: string; @IsString() @Length(10, 10) adminMobile: string; }

@Controller('centres')
@Roles('SUPER_ADMIN')
export class CentresController {
  constructor(private dbs: DbService) {}
  @Get() async list() {
    const db = this.dbs.db;
    const rows = await db.select({ id: centres.id, name: centres.name, city: centres.city, plan: centres.plan, createdAt: centres.createdAt, students: sql<number>`(select count(*) from ${students} where ${students.centreId} = ${centres.id} and ${students.active})` }).from(centres);
    return rows.map((r) => ({ ...r, students: Number(r.students) }));
  }
  /** Onboard a centre with its first admin in one call. */
  @Post() async create(@Body() dto: CentreDto) {
    const [c] = await this.dbs.db.insert(centres).values({ name: dto.name, city: dto.city, plan: dto.plan || 'starter' }).returning();
    const [admin] = await this.dbs.db.insert(users).values({ centreId: c.id, name: dto.adminName, mobile: dto.adminMobile, role: 'ADMIN' }).returning();
    return { centre: c, admin };
  }
}
