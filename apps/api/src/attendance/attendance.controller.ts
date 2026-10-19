import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { and, eq, gte, sql, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { NotificationsService } from '../notifications/notifications.service';

class MarkDto { @IsString() batchId: string; @IsString() date: string; @IsArray() marks: { studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' }[]; }
class ScanDto { @IsString() studentId: string; @IsOptional() @IsString() date?: string; }

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

@Controller('attendance')
export class AttendanceController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  /** Roll call: replaces the day's rows for the batch. Parents of absentees get a notification. */
  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
  async mark(@CurrentUser() u: JwtUser, @Body() dto: MarkDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const before = await db.select({ studentId: attendance.studentId, status: attendance.status }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.batchId, dto.batchId), eq(attendance.date, dto.date)));
    const prev = new Map(before.map((b) => [b.studentId, b.status]));
    await db.delete(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.batchId, dto.batchId), eq(attendance.date, dto.date)));
    if (dto.marks.length) await db.insert(attendance).values(dto.marks.map((m) => ({ ...m, centreId, batchId: dto.batchId, date: dto.date, markedBy: u.id })));
    const newlyAbsent = dto.marks.filter((m) => m.status === 'ABSENT' && prev.get(m.studentId) !== 'ABSENT').map((m) => m.studentId);
    if (newlyAbsent.length) {
      const kids = await db.select({ id: students.id, name: students.name, parentMobile: students.parentMobile }).from(students).where(inArray(students.id, newlyAbsent));
      for (const k of kids) {
        const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, k.parentMobile), eq(users.role, 'PARENT')));
        if (p) this.notify.notifyUsers(centreId, [p.id], `${k.name} was absent today`, `Marked absent for ${dto.date}. Contact the centre if this is a mistake.`, { data: { type: 'attendance', studentId: k.id } });
      }
    }
    return { ok: true, count: dto.marks.length };
  }

  /** QR at the gate: staff scans the student's ID card (QR = studentId). Marks PRESENT and tells the parent "Reached". */
  @Post('scan') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
  async scan(@CurrentUser() u: JwtUser, @Body() dto: ScanDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const date = dto.date || today();
    const [st] = await db.select().from(students).where(and(eq(students.id, dto.studentId), eq(students.centreId, centreId), eq(students.active, true)));
    if (!st) return { ok: false, error: 'Student not found in this centre' };
    if (!st.batchId) return { ok: false, error: `${st.name} has no batch assigned` };
    const [existing] = await db.select().from(attendance).where(and(eq(attendance.studentId, st.id), eq(attendance.date, date)));
    if (existing) return { ok: true, already: true, name: st.name, status: existing.status };
    await db.insert(attendance).values({ centreId, studentId: st.id, batchId: st.batchId, date, status: 'PRESENT', markedBy: u.id });
    const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT')));
    const time = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(11, 16);
    if (p) this.notify.notifyUsers(centreId, [p.id], `${st.name} reached the centre`, `Checked in at ${time}.`, { urgent: true, data: { type: 'attendance', studentId: st.id } });
    return { ok: true, name: st.name, rollNo: st.rollNo, status: 'PRESENT' };
  }

  @Get() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
  list(@CurrentUser() u: JwtUser, @Query('batchId') batchId: string, @Query('date') date: string, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(attendance).where(and(eq(attendance.centreId, centreOf(u, c)), eq(attendance.batchId, batchId), eq(attendance.date, date)));
  }

  /** Monthly summary per student (default: current month). `low` = below 75%. Staff: whole batch. Parent/student: own children. */
  @Get('summary') async summary(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('month') month?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const from = (month || today().slice(0, 7)) + '-01';
    let studentFilter: any = eq(students.centreId, centreId);
    if (u.role === 'STUDENT') studentFilter = and(studentFilter, eq(students.userId, u.id));
    if (u.role === 'PARENT') { const [me] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, u.id)); studentFilter = and(studentFilter, eq(students.parentMobile, me?.mobile || '')); }
    if (batchId) studentFilter = and(studentFilter, eq(students.batchId, batchId));
    const sts = await db.select({ id: students.id, name: students.name, rollNo: students.rollNo, batchId: students.batchId }).from(students).where(and(studentFilter, eq(students.active, true)));
    if (!sts.length) return [];
    const agg = await db.select({ studentId: attendance.studentId, present: sql<number>`count(*) filter (where ${attendance.status} in ('PRESENT','LATE'))`, total: sql<number>`count(*) filter (where ${attendance.status} <> 'LEAVE')` })
      .from(attendance).where(and(inArray(attendance.studentId, sts.map((s) => s.id)), gte(attendance.date, from))).groupBy(attendance.studentId);
    const m = new Map(agg.map((a) => [a.studentId, a]));
    return sts.map((s) => { const a = m.get(s.id); const present = Number(a?.present || 0), total = Number(a?.total || 0); const pct = total ? Math.round((present / total) * 100) : null; return { ...s, present, total, pct, low: pct !== null && pct < 75 }; });
  }

  /** Day-wise history for one student (parent/student app). */
  @Get('history') async history(@CurrentUser() u: JwtUser, @Query('studentId') studentId: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    return this.dbs.db.select({ date: attendance.date, status: attendance.status }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.studentId, studentId))).orderBy(sql`${attendance.date} desc`).limit(90);
  }
}
