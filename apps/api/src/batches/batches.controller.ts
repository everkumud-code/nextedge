import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class BatchDto { @IsString() name: string; @IsString() course: string; @IsOptional() @IsInt() capacity?: number; @IsOptional() @IsString() startDate?: string; }

@Controller('batches')
@Mod('students')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
export class BatchesController {
  constructor(private dbs: DbService) {}
  @Get() list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(batches).where(eq(batches.centreId, centreOf(u, c))).orderBy(batches.name);
  }
  @Post() @Roles('SUPER_ADMIN', 'ADMIN')
  async create(@CurrentUser() u: JwtUser, @Body() dto: BatchDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(batches).values({ ...dto, centreId: centreOf(u, c) }).returning();
    return row;
  }
}
