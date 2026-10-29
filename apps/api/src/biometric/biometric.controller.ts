import { BadRequestException, Body, Controller, Get, Headers, HttpException, Post, Query, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, eq, or } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, centreSettings, staffAttendance, students, users } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { PlatformService } from '../platform/platform.service';
import { NotificationsService } from '../notifications/notifications.service';

type Punch = { id: string; time?: string; type?: 'in' | 'out' };
const ist = (iso?: string) => { const d = iso ? new Date(iso) : new Date(); const t = new Date(d.getTime() + 5.5 * 3600e3); return { date: t.toISOString().slice(0, 10), hhmm: t.toISOString().slice(11, 16), at: d }; };

/** Biometric / RFID integration. A device (or its software) POSTs punches with the centre's API key; the same code serves a CSV upload from the admin panel. */
@Controller('biometric')
export class BiometricController {
  constructor(private dbs: DbService, private platform: PlatformService, private notify: NotificationsService) {}

  @Get('info') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async info(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const s = await this.platform.settings(centreOf(u, c)); return { key: s.biometricKey || null, endpoint: (process.env.PUBLIC_API_URL || 'https://coaching-connect-api.onrender.com') + '/api/biometric/punch', sample: { punches: [{ id: 'ADM/2024/0001 or roll no or staff mobile', time: '2026-10-29T07:52:10+05:30' }] } };
  }
  @Post('key') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async newKey(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const centreId = centreOf(u, c); await this.platform.settings(centreId); const key = 'bio_' + randomBytes(18).toString('hex'); await this.dbs.db.update(centreSettings).set({ biometricKey: key }).where(eq(centreSettings.centreId, centreId)); return { key }; }

  /** Device endpoint: header x-api-key (or body.key). Body: { punches: [{ id, time?, type? }] } or a single punch. */
  @Public() @Post('punch') async punch(@Headers('x-api-key') hk: string, @Body() b: any) {
    const key = hk || b?.key; if (!key) throw new UnauthorizedException('API key missing'); const [cs] = await this.dbs.db.select().from(centreSettings).where(eq(centreSettings.biometricKey, key)); if (!cs) throw new UnauthorizedException('Invalid API key');
    const punches: Punch[] = Array.isArray(b?.punches) ? b.punches : b?.id ? [b] : []; if (!punches.length) throw new BadRequestException('No punches');
    if (punches.length > 2000) throw new HttpException('Send at most 2000 punches per call', 413); return this.process(cs.centreId, punches);
  }

  /** Owner/office: import punches parsed from a CSV (id,time). */
  @Post('import') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async import(@CurrentUser() u: JwtUser, @Body() b: { punches: Punch[] }, @Query('centreId') c?: string) { return this.process(centreOf(u, c), b.punches || []); }

  private async process(centreId: string, punches: Punch[]) {
    const db = this.dbs.db; const r = { students: 0, staff: 0, alreadyMarked: 0, unknown: [] as string[] };
    const sts = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const stf = await db.select().from(users).where(and(eq(users.centreId, centreId)));
    for (const p of punches.sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
      const id = String(p.id || '').trim(); if (!id) continue; const { date, hhmm, at } = ist(p.time);
      const byAdm = sts.filter((s) => s.admissionNo?.toLowerCase() === id.toLowerCase()); const byRoll = byAdm.length ? byAdm : sts.filter((s) => s.rollNo === id); const st = byRoll.length === 1 ? byRoll[0] : null;
      if (st && st.batchId) {
        const [ex] = await db.select().from(attendance).where(and(eq(attendance.studentId, st.id), eq(attendance.date, date))); if (ex) { r.alreadyMarked++; continue; }
        await db.insert(attendance).values({ centreId, studentId: st.id, batchId: st.batchId, date, status: 'PRESENT' }); r.students++;
        const [par] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT'))); if (par) this.notify.notifyUsers(centreId, [par.id], `${st.name} reached school`, `Punched in at ${hhmm}.`, { data: { type: 'attendance', studentId: st.id } }); continue;
      }
      const sf = stf.find((x) => x.mobile === id.replace(/\D/g, '').slice(-10) && ['FACULTY', 'STAFF', 'ADMIN'].includes(x.role)); if (sf) {
        const [ex] = await db.select().from(staffAttendance).where(and(eq(staffAttendance.userId, sf.id), eq(staffAttendance.date, date)));
        if (!ex) { await db.insert(staffAttendance).values({ centreId, userId: sf.id, date, checkIn: at, status: 'present', note: 'Biometric' }); r.staff++; } else if (!ex.checkOut && at.getTime() - new Date(ex.checkIn || at).getTime() > 30 * 60e3) { await db.update(staffAttendance).set({ checkOut: at, minutes: Math.round((at.getTime() - new Date(ex.checkIn || at).getTime()) / 60000) }).where(eq(staffAttendance.id, ex.id)); r.staff++; } else r.alreadyMarked++; continue;
      }
      if (r.unknown.length < 50) r.unknown.push(id);
    }
    return r;
  }
}
