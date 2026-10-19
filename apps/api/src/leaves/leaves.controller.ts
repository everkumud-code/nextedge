import { Body, Controller, Get, Param, Post, Query, ForbiddenException } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, leaveRequests, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';

class ApplyDto { @IsString() studentId: string; @IsString() fromDate: string; @IsString() toDate: string; @IsString() reason: string; }
class DecideDto { @IsIn(['approved', 'rejected']) status: string; @IsOptional() @IsString() note?: string; }

/** Parent (or student) applies; owner/faculty approves. Approved days are marked LEAVE in attendance so they do not count against the percentage. */
@Controller('leaves')
@Mod('leaves')
export class LeavesController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    let where: any = eq(leaveRequests.centreId, centreId);
    if (!staff) { const mine = await myStudents(db, u, centreId); if (!mine.length) return []; where = and(where, inArray(leaveRequests.studentId, mine.map((s) => s.id))); }
    const rows = await db.select({ l: leaveRequests, studentName: students.name, rollNo: students.rollNo }).from(leaveRequests).innerJoin(students, eq(students.id, leaveRequests.studentId)).where(where).orderBy(desc(leaveRequests.createdAt)).limit(200);
    return rows.map((r) => ({ ...r.l, studentName: r.studentName, rollNo: r.rollNo }));
  }

  @Post() async apply(@CurrentUser() u: JwtUser, @Body() dto: ApplyDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const mine = await myStudents(db, u, centreId); const st = mine.find((s) => s.id === dto.studentId); if (!st) throw new ForbiddenException('Not your student');
    const [row] = await db.insert(leaveRequests).values({ centreId, studentId: st.id, fromDate: dto.fromDate, toDate: dto.toDate, reason: dto.reason }).returning();
    const staff = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['ADMIN', 'FACULTY'])));
    this.notify.notifyUsers(centreId, staff.map((s) => s.id), `Leave request: ${st.name}`, `${dto.fromDate} to ${dto.toDate} · ${dto.reason}`, { data: { type: 'leave', id: row.id } });
    return row;
  }

  @Post(':id/decide') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async decide(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: DecideDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [row] = await db.update(leaveRequests).set({ status: dto.status, note: dto.note, decidedBy: u.id }).where(and(eq(leaveRequests.id, id), eq(leaveRequests.centreId, centreId))).returning(); if (!row) return null;
    const [st] = await db.select().from(students).where(eq(students.id, row.studentId));
    if (dto.status === 'approved' && st?.batchId) {
      for (let d = new Date(row.fromDate); d <= new Date(row.toDate); d.setDate(d.getDate() + 1)) { const date = d.toISOString().slice(0, 10);
        await db.delete(attendance).where(and(eq(attendance.studentId, st.id), eq(attendance.date, date)));
        await db.insert(attendance).values({ centreId, studentId: st.id, batchId: st.batchId, date, status: 'LEAVE', markedBy: u.id }); }
    }
    const ids: string[] = []; if (st?.userId) ids.push(st.userId); const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT'))); if (p) ids.push(p.id);
    this.notify.notifyUsers(centreId, ids, `Leave ${dto.status}`, `${st?.name}: ${row.fromDate} to ${row.toDate}${dto.note ? ' · ' + dto.note : ''}`, { data: { type: 'leave', id } });
    return row;
  }
}
