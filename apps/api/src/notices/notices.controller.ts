import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, inArray, or, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { noticeReads, notices, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { NotificationsService } from '../notifications/notifications.service';

class NoticeDto { @IsString() title: string; @IsString() body: string; @IsIn(['GENERAL', 'HOLIDAY', 'EXAM', 'FEE', 'EVENT', 'URGENT']) type: any; @IsOptional() @IsString() batchId?: string; }

@Controller('notices')
@Mod('notices')
export class NoticesController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  /** Staff see all; students/parents see centre-wide + their batch's notices, with a `read` flag. */
  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    let where: any = eq(notices.centreId, centreId);
    if (u.role === 'STUDENT' || u.role === 'PARENT') {
      const me = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, u.id));
      const kids = await db.select({ batchId: students.batchId }).from(students).where(and(eq(students.centreId, centreId), u.role === 'STUDENT' ? eq(students.userId, u.id) : eq(students.parentMobile, me[0]?.mobile || '')));
      const bids = kids.map((k) => k.batchId).filter((x): x is string => !!x);
      where = and(eq(notices.centreId, centreId), bids.length ? or(isNull(notices.batchId), inArray(notices.batchId, bids)) : isNull(notices.batchId));
    }
    const rows = await db.select().from(notices).where(where).orderBy(desc(notices.publishedAt)).limit(100);
    const reads = rows.length ? await db.select({ noticeId: noticeReads.noticeId }).from(noticeReads).where(and(eq(noticeReads.userId, u.id), inArray(noticeReads.noticeId, rows.map((r) => r.id)))) : [];
    const seen = new Set(reads.map((r) => r.noticeId));
    return rows.map((r) => ({ ...r, read: seen.has(r.id) }));
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
  async create(@CurrentUser() u: JwtUser, @Body() dto: NoticeDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [row] = await this.dbs.db.insert(notices).values({ ...dto, centreId, createdBy: u.id }).returning();
    const audience = await this.notify.audienceForBatch(centreId, dto.batchId || null);
    this.notify.notifyUsers(centreId, audience, `${dto.type === 'URGENT' ? '🔴 ' : ''}${dto.title}`, dto.body, { urgent: dto.type === 'URGENT', data: { type: 'notice', id: row.id } });
    // After 2 hours, anyone who still has not opened the notice gets the WhatsApp/SMS fallback. (In-process timer; survives until restart — move to BullMQ when Redis queues land.)
    const delay = Number(process.env.NOTICE_FALLBACK_MINUTES || 120) * 60_000;
    setTimeout(async () => { try { const r = await this.reads(u, row.id, c); const ids = r.unread.map((p: any) => p.id); if (ids.length) this.notify.notifyUsers(centreId, ids, dto.title, dto.body, { urgent: dto.type === 'URGENT', waTemplate: process.env.WA_TEMPLATE_NOTICE, data: { type: 'notice', id: row.id } }); } catch {} }, delay).unref();
    return row;
  }

  @Post(':id/read') async markRead(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    const exists = await this.dbs.db.select({ id: noticeReads.id }).from(noticeReads).where(and(eq(noticeReads.noticeId, id), eq(noticeReads.userId, u.id)));
    if (!exists.length) await this.dbs.db.insert(noticeReads).values({ noticeId: id, userId: u.id });
    return { ok: true };
  }

  /** Seen-by report for admins: who read, who did not. */
  @Get(':id/reads') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
  async reads(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [n] = await db.select().from(notices).where(and(eq(notices.id, id), eq(notices.centreId, centreId)));
    if (!n) return { read: [], unread: [] };
    const audience = await this.notify.audienceForBatch(centreId, n.batchId);
    const people = audience.length ? await db.select({ id: users.id, name: users.name, role: users.role, mobile: users.mobile }).from(users).where(inArray(users.id, audience)) : [];
    const reads = await db.select({ userId: noticeReads.userId, readAt: noticeReads.readAt }).from(noticeReads).where(eq(noticeReads.noticeId, id));
    const map = new Map(reads.map((r) => [r.userId, r.readAt]));
    return { read: people.filter((p) => map.has(p.id)).map((p) => ({ ...p, readAt: map.get(p.id) })), unread: people.filter((p) => !map.has(p.id)) };
  }
}
