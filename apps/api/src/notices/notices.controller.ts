import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { notices } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class NoticeDto { @IsString() title: string; @IsString() body: string; @IsIn(['GENERAL', 'HOLIDAY', 'EXAM', 'FEE', 'EVENT', 'URGENT']) type: any; @IsOptional() @IsString() batchId?: string; }

@Controller('notices')
export class NoticesController {
  constructor(private dbs: DbService) {}
  @Get() list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(notices).where(eq(notices.centreId, centreOf(u, c))).orderBy(desc(notices.publishedAt)).limit(100);
  }
  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
  async create(@CurrentUser() u: JwtUser, @Body() dto: NoticeDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(notices).values({ ...dto, centreId: centreOf(u, c), createdBy: u.id }).returning();
    return row; // TODO Phase 1: enqueue push (FCM) to batch/centre; WhatsApp fallback after 2h unread.
  }
}
