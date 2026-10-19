import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { deviceTokens, notificationLog } from '../db/schema';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { Roles } from '../common/auth.guard';
import { centreOf } from '../common/tenant';

class TokenDto { @IsString() token: string; @IsIn(['android', 'ios', 'web']) platform: string; }

@Controller('notifications')
export class NotificationsController {
  constructor(private dbs: DbService) {}
  /** Mobile app registers its FCM token after login. */
  @Post('device') async device(@CurrentUser() u: JwtUser, @Body() dto: TokenDto) {
    await this.dbs.db.delete(deviceTokens).where(eq(deviceTokens.token, dto.token));
    await this.dbs.db.insert(deviceTokens).values({ userId: u.id, token: dto.token, platform: dto.platform }); return { ok: true };
  }
  @Get('log') @Roles('SUPER_ADMIN', 'ADMIN') log(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(notificationLog).where(eq(notificationLog.centreId, centreOf(u, c))).orderBy(desc(notificationLog.createdAt)).limit(200);
  }
}
