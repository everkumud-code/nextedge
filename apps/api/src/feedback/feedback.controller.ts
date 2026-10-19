import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { and, desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { feedback, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { NotificationsService } from '../notifications/notifications.service';

class FeedbackDto { @IsIn(['feedback', 'complaint', 'suggestion']) kind: string; @IsString() text: string; @IsOptional() @IsString() studentId?: string; }
class ReplyDto { @IsString() reply: string; @IsOptional() @IsIn(['replied', 'closed']) status?: string; }

/** Parents/students write to the owner privately; owner replies. */
@Controller('feedback')
@Mod('feedback')
export class FeedbackController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    const where = staff ? eq(feedback.centreId, centreId) : and(eq(feedback.centreId, centreId), eq(feedback.userId, u.id));
    const rows = await db.select({ f: feedback, by: users.name, role: users.role, studentName: students.name }).from(feedback).innerJoin(users, eq(users.id, feedback.userId)).leftJoin(students, eq(students.id, feedback.studentId)).where(where).orderBy(desc(feedback.createdAt)).limit(200);
    return rows.map((r) => ({ ...r.f, by: r.by, role: r.role, studentName: r.studentName }));
  }

  @Post() async create(@CurrentUser() u: JwtUser, @Body() dto: FeedbackDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [row] = await db.insert(feedback).values({ centreId, userId: u.id, studentId: dto.studentId, kind: dto.kind, text: dto.text }).returning();
    const owners = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN')));
    this.notify.notifyUsers(centreId, owners.map((o) => o.id), `New ${dto.kind} from ${u.name}`, dto.text.slice(0, 100), { data: { type: 'feedback', id: row.id } });
    return row;
  }

  @Post(':id/reply') @Roles('SUPER_ADMIN', 'ADMIN') async reply(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: ReplyDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [row] = await this.dbs.db.update(feedback).set({ reply: dto.reply, status: dto.status || 'replied' }).where(and(eq(feedback.id, id), eq(feedback.centreId, centreId))).returning();
    if (row) this.notify.notifyUsers(centreId, [row.userId], 'Reply from the centre', dto.reply.slice(0, 100), { data: { type: 'feedback', id } });
    return row;
  }
}
