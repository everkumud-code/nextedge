import { Body, Controller, Get, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, staffAttendance, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { label } from '../common/roles';
import { NotificationsService } from '../notifications/notifications.service';

class GeoDto { @IsNumber() lat: number; @IsNumber() lng: number; @IsOptional() @IsNumber() accuracy?: number; }
class ManualDto { @IsString() userId: string; @IsString() date: string; @IsString() status: string; @IsOptional() @IsString() note?: string; }
class LocationDto { @IsNumber() lat: number; @IsNumber() lng: number; @IsOptional() @IsNumber() geofenceM?: number; @IsOptional() @IsNumber() gpsToleranceM?: number; @IsOptional() @IsString() workStart?: string; @IsOptional() @IsNumber() lateAfterMin?: number; @IsOptional() @IsNumber() halfDayMin?: number; }

const ist = () => new Date(Date.now() + 5.5 * 3600e3); const today = () => ist().toISOString().slice(0, 10);
/** Haversine distance in metres. */
function metres(aLat: number, aLng: number, bLat: number, bLng: number) { const R = 6371000, r = Math.PI / 180; const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r; const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2; return Math.round(2 * R * Math.asin(Math.sqrt(h))); }

/** Teachers and staff check in/out from the app; the phone's GPS must be inside the centre's geofence. Owner sets the fence and sees the register. */
@Controller('staff-attendance')
@Mod('attendance')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
export class StaffAttendanceController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  private async fence(centreId: string) { const [s] = await this.dbs.db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId)); return s; }
  private check(s: any, dto: GeoDto) {
    if (!s?.lat || !s?.lng) throw new BadRequestException('The owner has not set the centre location yet.');
    const d = metres(dto.lat, dto.lng, Number(s.lat), Number(s.lng)); const allowed = s.geofenceM + Math.min(dto.accuracy || 0, s.gpsToleranceM ?? 5); // owner-set GPS tolerance on top of the fence
    if (d > allowed) throw new BadRequestException(`You are ${d} m from the centre (allowed ${s.geofenceM} m + ${Math.min(dto.accuracy || 0, s.gpsToleranceM ?? 5)} m GPS tolerance). Move closer and try again.`);
    return d;
  }

  /** Owner sets the centre's GPS point + radius + timings. */
  @Put('location') @Roles('SUPER_ADMIN', 'ADMIN') async setLocation(@CurrentUser() u: JwtUser, @Body() dto: LocationDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const exists = await this.fence(centreId);
    const vals: any = { lat: String(dto.lat), lng: String(dto.lng), updatedAt: new Date() }; if (dto.geofenceM) vals.geofenceM = dto.geofenceM; if (dto.gpsToleranceM !== undefined) vals.gpsToleranceM = Math.max(0, Math.min(50, dto.gpsToleranceM)); if (dto.workStart) vals.workStart = dto.workStart; if (dto.lateAfterMin !== undefined) vals.lateAfterMin = dto.lateAfterMin; if (dto.halfDayMin !== undefined) vals.halfDayMin = dto.halfDayMin;
    if (exists) await db.update(centreSettings).set(vals).where(eq(centreSettings.centreId, centreId)); else await db.insert(centreSettings).values({ centreId, ...vals });
    return { ok: true };
  }
  @Get('location') async getLocation(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const s = await this.fence(centreOf(u, c)); return s ? { lat: s.lat ? Number(s.lat) : null, lng: s.lng ? Number(s.lng) : null, geofenceM: s.geofenceM, gpsToleranceM: s.gpsToleranceM, workStart: s.workStart, lateAfterMin: s.lateAfterMin, halfDayMin: s.halfDayMin } : null; }

  /** Check in: inside the fence → present (or late after workStart + lateAfterMin). */
  @Post('check-in') async checkIn(@CurrentUser() u: JwtUser, @Body() dto: GeoDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const s = await this.fence(centreId); const d = this.check(s, dto); const date = today();
    const [existing] = await db.select().from(staffAttendance).where(and(eq(staffAttendance.userId, u.id), eq(staffAttendance.date, date)));
    if (existing?.checkIn) return { ok: true, already: true, checkIn: existing.checkIn, status: existing.status };
    const now = new Date(); const [h, m] = s.workStart.split(':').map(Number); const nowIst = ist(); const minsLate = (nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes()) - (h * 60 + m);
    const status = minsLate > s.lateAfterMin ? 'late' : 'present';
    const vals = { centreId, userId: u.id, date, checkIn: now, inLat: String(dto.lat), inLng: String(dto.lng), inDistanceM: d, status };
    if (existing) await db.update(staffAttendance).set(vals).where(eq(staffAttendance.id, existing.id)); else await db.insert(staffAttendance).values(vals);
    if (status === 'late') { const owners = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN'))); this.notify.notifyUsers(centreId, owners.map((o) => o.id), `${u.name} checked in late`, `${minsLate} min after ${s.workStart}.`, { data: { type: 'staff-attendance' } }); }
    return { ok: true, status, distanceM: d, checkIn: now, minsLate: Math.max(0, minsLate) };
  }

  @Post('check-out') async checkOut(@CurrentUser() u: JwtUser, @Body() dto: GeoDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const s = await this.fence(centreId); const d = this.check(s, dto);
    const [row] = await db.select().from(staffAttendance).where(and(eq(staffAttendance.userId, u.id), eq(staffAttendance.date, today())));
    if (!row?.checkIn) throw new BadRequestException('Check in first.');
    const now = new Date(); const minutes = Math.round((now.getTime() - row.checkIn.getTime()) / 60000);
    const status = row.status === 'late' ? 'late' : minutes < s.halfDayMin ? 'half-day' : 'present';
    await db.update(staffAttendance).set({ checkOut: now, outLat: String(dto.lat), outLng: String(dto.lng), outDistanceM: d, minutes, status }).where(eq(staffAttendance.id, row.id));
    return { ok: true, minutes, status };
  }

  /** My own today + this month (for the app card). */
  @Get('me') async me(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const month = today().slice(0, 7);
    const rows = await this.dbs.db.select().from(staffAttendance).where(and(eq(staffAttendance.centreId, centreId), eq(staffAttendance.userId, u.id), gte(staffAttendance.date, month + '-01'))).orderBy(desc(staffAttendance.date));
    const t = rows.find((r) => r.date === today()) || null;
    return { today: t, month: { present: rows.filter((r) => ['present', 'late', 'manual'].includes(r.status)).length, late: rows.filter((r) => r.status === 'late').length, halfDay: rows.filter((r) => r.status === 'half-day').length, leave: rows.filter((r) => r.status === 'leave').length, minutes: rows.reduce((a, r) => a + r.minutes, 0) }, rows };
  }

  /** Owner's register: every teacher/staff for a date (default today) and month summary. */
  @Get('register') @Roles('SUPER_ADMIN', 'ADMIN') async register(@CurrentUser() u: JwtUser, @Query('date') date?: string, @Query('month') month?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const d = date || today(); const m = month || d.slice(0, 7);
    const people = await db.select({ id: users.id, name: users.name, role: users.role, mobile: users.mobile }).from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF'])));
    const rows = await db.select().from(staffAttendance).where(and(eq(staffAttendance.centreId, centreId), gte(staffAttendance.date, m + '-01'), lte(staffAttendance.date, m + '-31')));
    return people.map((p) => { const mine = rows.filter((r) => r.userId === p.id); const t = mine.find((r) => r.date === d) || null;
      return { ...p, roleLabel: label(p.role), today: t, month: { days: mine.filter((r) => ['present', 'late', 'manual', 'half-day'].includes(r.status)).length, late: mine.filter((r) => r.status === 'late').length, halfDay: mine.filter((r) => r.status === 'half-day').length, leave: mine.filter((r) => r.status === 'leave').length, hours: Math.round(mine.reduce((a, r) => a + r.minutes, 0) / 6) / 10 } }; });
  }

  /** Owner marks manually (forgot phone, on leave, field work). */
  @Post('manual') @Roles('SUPER_ADMIN', 'ADMIN') async manual(@CurrentUser() u: JwtUser, @Body() dto: ManualDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [row] = await db.select().from(staffAttendance).where(and(eq(staffAttendance.userId, dto.userId), eq(staffAttendance.date, dto.date)));
    const vals = { centreId, userId: dto.userId, date: dto.date, status: dto.status, note: dto.note, markedBy: u.id };
    if (row) await db.update(staffAttendance).set(vals).where(eq(staffAttendance.id, row.id)); else await db.insert(staffAttendance).values(vals);
    return { ok: true };
  }
}
