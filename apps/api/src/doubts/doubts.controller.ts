import { Body, Controller, Get, Param, Post, Query, ForbiddenException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { doubts, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';

class AskDto { @IsString() studentId: string; @IsString() subject: string; @IsString() question: string; @IsOptional() @IsString() imageUrl?: string; }
class AnswerDto { @IsString() answer: string; }

/** Student asks (text + optional photo link); faculty answers; student marks resolved. Unanswered >24h are flagged for the owner. */
@Controller('doubts')
@Mod('doubts')
export class DoubtsController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    let where: any = eq(doubts.centreId, centreId);
    if (!staff) { const mine = await myStudents(db, u, centreId); if (!mine.length) return []; where = and(where, inArray(doubts.studentId, mine.map((s) => s.id))); }
    const rows = await db.select({ d: doubts, studentName: students.name, batchId: students.batchId }).from(doubts).innerJoin(students, eq(students.id, doubts.studentId)).where(where).orderBy(desc(doubts.createdAt)).limit(200);
    const dayAgo = Date.now() - 24 * 3600e3;
    return rows.map((r) => ({ ...r.d, studentName: r.studentName, batchId: r.batchId, overdue: !r.d.answer && r.d.createdAt.getTime() < dayAgo }));
  }

  @Post() async ask(@CurrentUser() u: JwtUser, @Body() dto: AskDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const mine = await myStudents(db, u, centreId); const st = mine.find((s) => s.id === dto.studentId); if (!st) throw new ForbiddenException('Not your student');
    const [row] = await db.insert(doubts).values({ centreId, studentId: st.id, batchId: st.batchId, subject: dto.subject, question: dto.question, imageUrl: dto.imageUrl }).returning();
    const fac = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['FACULTY', 'ADMIN'])));
    this.notify.notifyUsers(centreId, fac.map((f) => f.id), `New doubt · ${dto.subject}`, `${st.name}: ${dto.question.slice(0, 80)}`, { data: { type: 'doubt', id: row.id } });
    return row;
  }

  @Post(':id/answer') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async answer(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: AnswerDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [row] = await db.update(doubts).set({ answer: dto.answer, answeredBy: u.id, answeredAt: new Date() }).where(and(eq(doubts.id, id), eq(doubts.centreId, centreId))).returning();
    if (row) { const [st] = await db.select().from(students).where(eq(students.id, row.studentId)); if (st?.userId) this.notify.notifyUsers(centreId, [st.userId], `Doubt answered · ${row.subject}`, dto.answer.slice(0, 100), { data: { type: 'doubt', id } }); }
    return row;
  }

  @Post(':id/resolve') async resolve(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    await this.dbs.db.update(doubts).set({ resolved: true }).where(and(eq(doubts.id, id), eq(doubts.centreId, centreOf(u, c)))); return { ok: true };
  }
}
