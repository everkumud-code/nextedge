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
import { PlatformService } from '../platform/platform.service';
import { zoomCreateMeeting } from '../integrations/zoom';
import { LiveService } from './live.service';

class LiveDto { @IsOptional() hybrid?: boolean; @IsString() batchId: string; @IsString() title: string; @IsString() startAt: string; @IsOptional() @IsInt() @Min(10) durationMin?: number; @IsOptional() @IsString() joinUrl?: string; }

/** Jitsi Meet is the free default (no account needed). Set LIVE_PROVIDER=agora + AGORA_APP_ID later for in-app video; the mobile app renders either. */
const roomUrl = (centreId: string, id: string) => `https://${process.env.JITSI_HOST || 'meet.jit.si'}/cc-${centreId.slice(0, 8)}-${id.slice(0, 8)}#config.prejoinPageEnabled=false`;

@Controller('live')
@Mod('live')
export class LiveController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService, private svc: LiveService) {}

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'].includes(u.role);
    let where: any = eq(liveClasses.centreId, centreId);
    if (!staff) { const mine = await myStudents(db, u, centreId); const bids = [...new Set(mine.map((s) => s.batchId).filter((x): x is string => !!x))]; if (!bids.length) return []; where = and(where, inArray(liveClasses.batchId, bids)); }
    return db.select().from(liveClasses).where(where).orderBy(desc(liveClasses.startAt)).limit(100);
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async create(@CurrentUser() u: JwtUser, @Body() dto: LiveDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    // Provider is a centre setting: jitsi (free, auto room) | zoom (auto meeting via API) | meet / teams / custom (centre's standing link) | or a one-off link typed on the form.
    const st = await this.platform.settings(centreId); const dur = dto.durationMin || 60; let provider = dto.joinUrl ? 'external' : st.liveProvider; let joinUrl = dto.joinUrl || ''; let hostUrl: string | undefined;
    if (!joinUrl && provider === 'zoom') {
      if (!st.zoomAccountId || !st.zoomClientId || !st.zoomClientSecret) provider = 'jitsi';
      else { try { const z = await zoomCreateMeeting({ accountId: st.zoomAccountId, clientId: st.zoomClientId, clientSecret: st.zoomClientSecret }, dto.title, new Date(dto.startAt), dur); joinUrl = z.joinUrl; hostUrl = z.startUrl; } catch (e: any) { provider = 'jitsi'; console.warn('Zoom failed, falling back to Jitsi:', e.message); } }
    }
    if (!joinUrl && ['meet', 'teams', 'custom'].includes(provider)) { if (st.defaultMeetingUrl) joinUrl = st.defaultMeetingUrl; else provider = 'jitsi'; }
    const [row] = await db.insert(liveClasses).values({ centreId, batchId: dto.batchId, title: dto.title, startAt: new Date(dto.startAt), durationMin: dur, provider, joinUrl: joinUrl || 'pending', createdBy: u.id, hybrid: dto.hybrid === true }).returning();
    if (!joinUrl) { joinUrl = roomUrl(centreId, row.id); await db.update(liveClasses).set({ joinUrl }).where(eq(liveClasses.id, row.id)); }
    const aud = dto.hybrid === true ? [] : await this.notify.audienceForBatch(centreId, dto.batchId); // a classroom class is announced only to the absent children, when it starts
    this.notify.notifyUsers(centreId, aud, `Live class: ${dto.title}`, `Starts ${new Date(dto.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, { data: { type: 'live', id: row.id } });
    return { ...row, joinUrl, hostUrl };
  }

  /** Faculty taps Start: status=live and every student gets a push "Join now" (bypasses quiet hours). */
  @Post(':id/start') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async start(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [t] = await this.dbs.db.update(liveClasses).set({ status: 'live' }).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreId))).returning();
    if (t?.hybrid) { const r = await this.svc.sendLinksToAbsent(centreId, t); return { ...t, linksSent: r.sent, absent: r.absent }; }
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
    if (t.hybrid) { const [{ n }] = await db.select({ n: sql<number>`count(distinct ${liveAttendance.studentId})` }).from(liveAttendance).where(eq(liveAttendance.liveClassId, id)); return { ...t, hybrid: true, online: Number(n) }; } // classroom class: the teacher's attendance stays exactly as marked
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

  /** Hybrid class: send the link again to children who became absent after the class started (the teacher taps this, or it happens by itself when attendance is saved). */
  @Post(':id/send-links') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async sendLinks(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const [t] = await this.dbs.db.select().from(liveClasses).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreId))); if (!t) return null;
    return this.svc.sendLinksToAbsent(centreId, t);
  }
  /** Hybrid class: the children who are absent today, whether they got the link, and how long they watched. */
  @Get(':id/absent') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async absent(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [t] = await db.select().from(liveClasses).where(and(eq(liveClasses.id, id), eq(liveClasses.centreId, centreId))); if (!t) return [];
    const kids = await this.svc.absentToday(centreId, t.batchId); const sent: string[] = JSON.parse(t.linkSentTo || '[]');
    const watched = await db.select({ studentId: liveAttendance.studentId, minutes: sql<number>`sum(${liveAttendance.minutes})`, open: sql<number>`count(*) filter (where ${liveAttendance.leftAt} is null)` }).from(liveAttendance).where(eq(liveAttendance.liveClassId, id)).groupBy(liveAttendance.studentId);
    return kids.map((k) => { const w = watched.find((x) => x.studentId === k.id); return { studentId: k.id, name: k.name, status: k.status, linkSent: sent.includes(k.id), joined: !!w, watching: !!w && Number(w.open) > 0, minutes: w ? Math.round(Number(w.minutes)) : 0 }; });
  }

  /** Attendance report for one live class. */
  @Get(':id/attendance') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') attendance(@Param('id') id: string) {
    return this.dbs.db.select({ studentId: liveAttendance.studentId, minutes: sql<number>`sum(${liveAttendance.minutes})`, firstJoin: sql<string>`min(${liveAttendance.joinedAt})` }).from(liveAttendance).where(eq(liveAttendance.liveClassId, id)).groupBy(liveAttendance.studentId);
  }
}
