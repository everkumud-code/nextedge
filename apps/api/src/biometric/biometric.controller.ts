import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpException, Param, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, biometricDevices, biometricPins, centreSettings, staffAttendance, students, users } from '../db/schema';
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
    const s = await this.platform.settings(centreOf(u, c)); return { key: s.biometricKey || null, endpoint: (process.env.PUBLIC_API_URL || 'https://admin.nextsoftwares.in') + '/api/biometric/punch', sample: { punches: [{ id: 'ADM/2024/0001 or roll no or staff mobile', time: '2026-10-29T07:52:10+05:30' }] } };
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

  // ---------- IDs on the machine ----------
  @Get('pins') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async pins(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const ps = await db.select().from(biometricPins).where(eq(biometricPins.centreId, centreId)); const sts = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const stf = await db.select().from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['FACULTY', 'STAFF', 'ADMIN']))); const bs = await db.select().from(batches).where(eq(batches.centreId, centreId));
    const people = [...sts.map((x) => ({ kind: 'student', id: x.id, name: x.name, detail: bs.find((b) => b.id === x.batchId)?.name || '' })), ...stf.map((x) => ({ kind: 'staff', id: x.id, name: x.name, detail: x.role === 'FACULTY' ? 'Teacher' : x.role === 'ADMIN' ? 'Owner / Principal' : 'Staff' }))];
    return people.map((p) => { const row = ps.find((q) => (p.kind === 'student' ? q.studentId : q.userId) === p.id); return { ...p, pinId: row?.id || null, pin: row?.pin || null }; }).sort((a, b) => (a.pin ? Number(a.pin) : 1e9) - (b.pin ? Number(b.pin) : 1e9) || a.name.localeCompare(b.name));
  }
  /** Give every student and staff member without one the next free number (enrol each fingerprint / face under this number on the machine). */
  @Post('pins/generate') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async genPins(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const have = await db.select().from(biometricPins).where(eq(biometricPins.centreId, centreId)); let next = Math.max(0, ...have.map((p) => Number(p.pin) || 0)) + 1;
    const sts = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const stf = await db.select().from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['FACULTY', 'STAFF', 'ADMIN'])));
    const rows: any[] = []; for (const x of stf) if (!have.some((p) => p.userId === x.id)) rows.push({ centreId, pin: String(next++), userId: x.id });
    for (const x of sts.sort((a, b) => a.name.localeCompare(b.name))) if (!have.some((p) => p.studentId === x.id)) rows.push({ centreId, pin: String(next++), studentId: x.id });
    for (let i = 0; i < rows.length; i += 300) await db.insert(biometricPins).values(rows.slice(i, i + 300)); return { created: rows.length };
  }
  @Put('pins/:kind/:id') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async setPin(@CurrentUser() u: JwtUser, @Param('kind') kind: string, @Param('id') id: string, @Body() b: { pin: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const pin = String(b.pin || '').trim(); if (!/^\d{1,9}$/.test(pin)) throw new BadRequestException('The ID on the machine must be 1 to 9 digits');
    const clash = await db.select().from(biometricPins).where(and(eq(biometricPins.centreId, centreId), eq(biometricPins.pin, pin))); if (clash.some((x) => (kind === 'student' ? x.studentId : x.userId) !== id)) throw new BadRequestException(`ID ${pin} already belongs to someone else`);
    const col = kind === 'student' ? biometricPins.studentId : biometricPins.userId; const [ex] = await db.select().from(biometricPins).where(and(eq(biometricPins.centreId, centreId), eq(col, id)));
    if (ex) await db.update(biometricPins).set({ pin }).where(eq(biometricPins.id, ex.id)); else await db.insert(biometricPins).values({ centreId, pin, ...(kind === 'student' ? { studentId: id } : { userId: id }) }); return { ok: true };
  }
  // ---------- machines ----------
  @Get('devices') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') devices(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { return this.dbs.db.select().from(biometricDevices).where(eq(biometricDevices.centreId, centreOf(u, c))).orderBy(asc(biometricDevices.name)); }
  @Post('devices') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async addDevice(@CurrentUser() u: JwtUser, @Body() b: { serial: string; name?: string }, @Query('centreId') c?: string) {
    const serial = String(b.serial || '').trim().toUpperCase(); if (!/^[A-Z0-9]{5,30}$/.test(serial)) throw new BadRequestException('Enter the serial number printed on the machine (letters and digits)');
    const [ex] = await this.dbs.db.select().from(biometricDevices).where(eq(biometricDevices.serial, serial)); if (ex) throw new BadRequestException('This machine is already registered'); const [row] = await this.dbs.db.insert(biometricDevices).values({ serial, centreId: centreOf(u, c), name: String(b.name || 'Machine').slice(0, 60) }).returning(); return row;
  }
  @Delete('devices/:serial') @Mod('biometric') @Roles('SUPER_ADMIN', 'ADMIN') async delDevice(@CurrentUser() u: JwtUser, @Param('serial') serial: string, @Query('centreId') c?: string) { await this.dbs.db.delete(biometricDevices).where(and(eq(biometricDevices.serial, serial.toUpperCase()), eq(biometricDevices.centreId, centreOf(u, c)))); return { ok: true }; }

  async process(centreId: string, punches: Punch[]) {
    const db = this.dbs.db; const r = { students: 0, staff: 0, alreadyMarked: 0, unknown: [] as string[] }; const pinRows = await db.select().from(biometricPins).where(eq(biometricPins.centreId, centreId));
    const sts = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const stf = await db.select().from(users).where(and(eq(users.centreId, centreId)));
    for (const p of punches.sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
      const id = String(p.id || '').trim(); if (!id) continue; const { date, hhmm, at } = ist(p.time);
      const pr = pinRows.find((q) => q.pin === id); // the ID enrolled on the machine wins; otherwise admission no, roll no or staff mobile
      const byAdm = sts.filter((s) => s.admissionNo?.toLowerCase() === id.toLowerCase()); const byRoll = byAdm.length ? byAdm : sts.filter((s) => s.rollNo === id); const st = pr ? (pr.studentId ? sts.find((x) => x.id === pr.studentId) || null : null) : byRoll.length === 1 ? byRoll[0] : null;
      if (st && st.batchId) {
        const [ex] = await db.select().from(attendance).where(and(eq(attendance.studentId, st.id), eq(attendance.date, date))); if (ex) { r.alreadyMarked++; continue; }
        await db.insert(attendance).values({ centreId, studentId: st.id, batchId: st.batchId, date, status: 'PRESENT' }); r.students++;
        const [par] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT'))); if (par) this.notify.notifyUsers(centreId, [par.id], `${st.name} reached school`, `Punched in at ${hhmm}.`, { data: { type: 'attendance', studentId: st.id } }); continue;
      }
      const sf = pr ? (pr.userId ? stf.find((x) => x.id === pr.userId && ['FACULTY', 'STAFF', 'ADMIN'].includes(x.role)) : undefined) : stf.find((x) => x.mobile === id.replace(/\D/g, '').slice(-10) && ['FACULTY', 'STAFF', 'ADMIN'].includes(x.role)); if (sf) {
        const [ex] = await db.select().from(staffAttendance).where(and(eq(staffAttendance.userId, sf.id), eq(staffAttendance.date, date)));
        if (!ex) { await db.insert(staffAttendance).values({ centreId, userId: sf.id, date, checkIn: at, status: 'present', note: 'Biometric' }); r.staff++; } else if (!ex.checkOut && at.getTime() - new Date(ex.checkIn || at).getTime() > 30 * 60e3) { await db.update(staffAttendance).set({ checkOut: at, minutes: Math.round((at.getTime() - new Date(ex.checkIn || at).getTime()) / 60000) }).where(eq(staffAttendance.id, ex.id)); r.staff++; } else r.alreadyMarked++; continue;
      }
      if (r.unknown.length < 50) r.unknown.push(id);
    }
    return r;
  }
}
