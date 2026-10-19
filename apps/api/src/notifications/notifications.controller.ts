import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
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
  /** The bell: this user's notifications, newest first, with unread count. */
  @Get('mine') async mine(@CurrentUser() u: JwtUser, @Query('before') before?: string) {
    const db = this.dbs.db;
    const rows = await db.select({ id: notificationLog.id, title: notificationLog.title, body: notificationLog.body, data: notificationLog.data, readAt: notificationLog.readAt, createdAt: notificationLog.createdAt }).from(notificationLog).where(eq(notificationLog.userId, u.id)).orderBy(desc(notificationLog.createdAt)).limit(100);
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(notificationLog).where(and(eq(notificationLog.userId, u.id), isNull(notificationLog.readAt)));
    return { unread: Number(n), items: rows.map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })) };
  }
  @Post('read-all') async readAll(@CurrentUser() u: JwtUser) { await this.dbs.db.update(notificationLog).set({ readAt: new Date() }).where(and(eq(notificationLog.userId, u.id), isNull(notificationLog.readAt))); return { ok: true }; }
  @Post(':id/read') async read(@CurrentUser() u: JwtUser, @Param('id') id: string) { await this.dbs.db.update(notificationLog).set({ readAt: new Date() }).where(and(eq(notificationLog.id, id), eq(notificationLog.userId, u.id))); return { ok: true }; }

  @Get('log') @Roles('SUPER_ADMIN', 'ADMIN') log(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(notificationLog).where(eq(notificationLog.centreId, centreOf(u, c))).orderBy(desc(notificationLog.createdAt)).limit(200);
  }
}
