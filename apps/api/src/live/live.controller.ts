import { Body, Controller, Get, Param, Post, Put, Query, ForbiddenException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, liveAttendance, liveClasses } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';

class LiveDto { @IsString() batchId: string; @IsString() title: string; @IsString() startAt: string; @IsOptional() @IsInt() @Min(10) durationMin?: number; @IsOptional() @IsString() joinUrl?: string; }

/** Jitsi Meet is the free default (no account needed). Set LIVE_PROVIDER=agora + AGORA_APP_ID later for in-app video; the mobile app renders either. */
const roomUrl = (centreId: string, id: string) => `https://${process.env.JITSI_HOST || 'meet.jit.si'}/cc-${centreId.slice(0, 8)}-${id.slice(0, 8)}#config.prejoinPageEnabled=false`;

@Controller('live')
@Mod('live')
export class LiveController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    let where: any = eq(liveClasses.centreId, centreId);
    if (!staff) { const mine = await myStudents(db, u, centreId); const bids = [...new Set(mine.map((s) => s.batchId).filter((x): x is string => !!x))]; if (!bids.length) return []; where = and(where, inArray(liveClasses.batchId, bids)); }
    return db.select().from(liveClasses).where(where).orderBy(desc(liveClasses.startAt)).limit(100);
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async create(@CurrentUser() u: JwtUser, @Body() dto: LiveDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [row] = await db.insert(liveClasses).values({ centreId, batchId: dto.batchId, title: dto.title, startAt: new Date(dto.startAt), durationMin: dto.durationMin || 60, provider: dto.joinUrl ? 'external' : 'jitsi', joinUrl: dto.joinUrl || 'pending', createdBy: u.id }).returning();
    const joinUrl = dto.joinUrl || roomUrl(centreId, row.id); await db.update(liveClasses).set({ joinUrl }).where(eq(liveClasses.id, row.id));
    const aud = await this.notify.audienceForBatch(centreId, dto.batchId);
    this.notify.notifyUsers(centreId, aud, `Live class: ${dto.title}`, `Starts ${new Date(dto.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, { data: { type: 'live', id: row.id } });
    return { ...row, joinUrl };
  }

  /** Faculty taps Start: status=live and every student gets a push "Join now" (bypasses quiet hours). */
  @Post(':id/start') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async start(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [t] = await this.dbs.db.update(liveClasses).set({ status: 'live' }).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreId))).returning();
    if (t) { const aud = await this.notify.audienceForBatch(centreId, t.batchId, ['STUDENT']); this.notify.notifyUsers(centreId, aud, `${t.title} is live now`, 'Tap to join the class.', { urgent: true, data: { type: 'live', id } }); }
    return t;
  }

  /** Student taps Join: logs join time (for auto-attendance). */
  @Post(':id/join') async join(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { studentId: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const mine = await myStudents(db, u, centreId); if (!mine.find((s) => s.id === b.studentId)) throw new ForbiddenException('Not your student');
    const [t] = await db.select().from(liveClasses).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreId))); if (!t) return { ok: false };
    const [open] = await db.select().from(liveAttendance).where(and(eq(liveAttendance.liveClassId, id), eq(liveAttendance.studentId, b.studentId), sql`${liveAttendance.leftAt} is null`));
    if (!open) await db.insert(liveAttendance).values({ liveClassId: id, studentId: b.studentId });
    return { ok: true, joinUrl: t.joinUrl };
  }
  @Post(':id/leave') async leave(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { studentId: string }) {
    const db = this.dbs.db; const [open] = await db.select().from(liveAttendance).where(and(eq(liveAttendance.liveClassId, id), eq(liveAttendance.studentId, b.studentId), sql`${liveAttendance.leftAt} is null`));
    if (open) await db.update(liveAttendance).set({ leftAt: new Date(), minutes: sql`${liveAttendance.minutes} + extract(epoch from now() - ${liveAttendance.joinedAt}) / 60` }).where(eq(liveAttendance.id, open.id));
    return { ok: true };
  }

  /** Faculty taps End: closes open sessions, marks PRESENT in attendance for students who stayed ≥60% of the duration, ABSENT for the rest of the batch. */
  @Post(':id/end') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async end(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { recordingUrl?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [t] = await db.update(liveClasses).set({ status: 'ended', recordingUrl: b?.recordingUrl }).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreId))).returning(); if (!t) return null;
    await db.update(liveAttendance).set({ leftAt: new Date(), minutes: sql`${liveAttendance.minutes} + extract(epoch from now() - ${liveAttendance.joinedAt}) / 60` }).where(and(eq(liveAttendance.liveClassId, id), sql`${liveAttendance.leftAt} is null`));
    const sessions = await db.select({ studentId: liveAttendance.studentId, minutes: sql<number>`sum(${liveAttendance.minutes})` }).from(liveAttendance).where(eq(liveAttendance.liveClassId, id)).groupBy(liveAttendance.studentId);
    const present = new Set(sessions.filter((s) => Number(s.minutes) >= t.durationMin * 0.6).map((s) => s.studentId));
    const batchSts = await myStudents(db, u, centreId); const date = new Date(t.startAt.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const rows = batchSts.filter((s) => s.batchId === t.batchId).map((s) => ({ centreId, studentId: s.id, batchId: t.batchId, date, status: (present.has(s.id) ? 'PRESENT' : 'ABSENT') as any, markedBy: u.id }));
    await db.delete(attendance).where(and(eq(attendance.batchId, t.batchId), eq(attendance.date, date)));
    if (rows.length) await db.insert(attendance).values(rows);
    if (b?.recordingUrl) { const aud = await this.notify.audienceForBatch(centreId, t.batchId, ['STUDENT']); this.notify.notifyUsers(centreId, aud, `Recording: ${t.title}`, 'The class recording is in the Study library.', { data: { type: 'live', id } }); }
    return { ...t, present: present.size, absent: rows.length - present.size };
  }

  @Put(':id') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: Partial<{ status: string; recordingUrl: string; startAt: string; title: string }>, @Query('centreId') c?: string) {
    const set: any = { ...b }; if (b.startAt) set.startAt = new Date(b.startAt);
    const [t] = await this.dbs.db.update(liveClasses).set(set).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreOf(u, c)))).returning();
    if (t && (b.status === 'cancelled' || b.startAt)) { const aud = await this.notify.audienceForBatch(centreOf(u, c), t.batchId); this.notify.notifyUsers(centreOf(u, c), aud, b.status === 'cancelled' ? `Cancelled: ${t.title}` : `Rescheduled: ${t.title}`, b.status === 'cancelled' ? 'Today’s live class is cancelled.' : `New time: ${t.startAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { urgent: true }); }
    return t;
  }

  /** Attendance report for one live class. */
  @Get(':id/attendance') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') attendance(@Param('id') id: string) {
    return this.dbs.db.select({ studentId: liveAttendance.studentId, minutes: sql<number>`sum(${liveAttendance.minutes})`, firstJoin: sql<string>`min(${liveAttendance.joinedAt})` }).from(liveAttendance).where(eq(liveAttendance.liveClassId, id)).groupBy(liveAttendance.studentId);
  }
}
