import { BadRequestException, Body, Controller, Delete, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { busLocations, centreSettings, records, users } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { PlatformService } from '../platform/platform.service';

type Fix = { routeId?: string; vehicle?: string; lat: number; lng: number; speed?: number; time?: string };
const mapsUrl = (lat: any, lng: any) => `https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
const valid = (f: Fix) => Number.isFinite(Number(f.lat)) && Number.isFinite(Number(f.lng)) && Math.abs(Number(f.lat)) <= 90 && Math.abs(Number(f.lng)) <= 180 && !(Number(f.lat) === 0 && Number(f.lng) === 0);

/** Live bus: GPS trackers (or the driver's phone) send the position; owners see all buses, parents see the bus of their child's route. */
@Controller('transport')
export class TransportController {
  constructor(private dbs: DbService, private platform: PlatformService) {}

  private async save(centreId: string, fixes: Fix[], source: string) {
    const db = this.dbs.db; const routes = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'transport-route'))); let saved = 0; const unknown: string[] = [];
    for (const f of fixes) {
      if (!valid(f)) { unknown.push('bad position'); continue; } const veh = String(f.vehicle || '').replace(/\s+/g, '').toLowerCase(); const rt = routes.find((r) => r.id === f.routeId) || (veh ? routes.find((r) => String(JSON.parse(r.data || '{}').vehicle || '').replace(/\s+/g, '').toLowerCase() === veh) : undefined);
      if (!rt) { unknown.push(String(f.routeId || f.vehicle || '?')); continue; } const at = f.time && !Number.isNaN(Date.parse(f.time)) ? new Date(f.time) : new Date(); if (at.getTime() > Date.now() + 5 * 60e3) { unknown.push('time in the future'); continue; }
      const vals = { routeId: rt.id, centreId, lat: String(f.lat), lng: String(f.lng), speed: f.speed !== undefined ? String(f.speed) : null, source, at };
      await db.insert(busLocations).values(vals).onConflictDoUpdate({ target: busLocations.routeId, set: { lat: vals.lat, lng: vals.lng, speed: vals.speed, source, at } }); saved++;
    }
    return { saved, unknown: unknown.slice(0, 20) };
  }

  /** GPS tracker / gateway: header x-api-key (the centre's tracker key). Body: one fix or { fixes: [...] }; match by routeId or vehicle number. */
  @Public() @Post('location') async fromTracker(@Headers('x-api-key') hk: string, @Body() b: any) {
    const key = hk || b?.key; if (!key) throw new UnauthorizedException('API key missing'); const [cs] = await this.dbs.db.select().from(centreSettings).where(eq(centreSettings.trackerKey, key)); if (!cs) throw new UnauthorizedException('Invalid API key');
    const fixes: Fix[] = Array.isArray(b?.fixes) ? b.fixes : b?.lat !== undefined ? [b] : []; if (!fixes.length) throw new BadRequestException('No position sent'); return this.save(cs.centreId, fixes.slice(0, 200), 'tracker');
  }
  /** The driver's phone (a staff login with transport access). */
  @Post('location/mine') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF') @Mod('transport') async fromDriver(@CurrentUser() u: JwtUser, @Body() b: Fix, @Query('centreId') c?: string) { return this.save(centreOf(u, c), [b], 'driver-app'); }

  /** Driver ends the trip: the bus disappears from parents' maps instead of showing a stale position. */
  @Delete('location/mine') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF') @Mod('transport') async endTrip(@CurrentUser() u: JwtUser, @Query('routeId') routeId: string, @Query('centreId') c?: string) { if (!routeId) throw new BadRequestException('Choose the route'); await this.dbs.db.delete(busLocations).where(and(eq(busLocations.routeId, routeId), eq(busLocations.centreId, centreOf(u, c)))); return { ok: true }; }

  @Get('tracker') @Roles('SUPER_ADMIN', 'ADMIN') @Mod('transport') async tracker(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const s = await this.platform.settings(centreOf(u, c)); return { key: (s as any).trackerKey || null, endpoint: (process.env.PUBLIC_API_URL || 'https://admin.nextsoftwares.in') + '/api/transport/location', sample: { vehicle: 'JH01AB1234', lat: 23.3441, lng: 85.3096, speed: 32 } }; }
  @Post('tracker/key') @Roles('SUPER_ADMIN', 'ADMIN') @Mod('transport') async newKey(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const centreId = centreOf(u, c); await this.platform.settings(centreId); const key = 'trk_' + randomBytes(18).toString('hex'); await this.dbs.db.update(centreSettings).set({ trackerKey: key }).where(eq(centreSettings.centreId, centreId)); return { key }; }

  /** Owner / office: every route with its latest position. */
  @Get('live') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF') @Mod('transport') async live(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [me] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, u.id)); const tail = (x?: string | null) => String(x || '').replace(/\D/g, '').slice(-10); const routes = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'transport-route'))); const locs = await db.select().from(busLocations).where(eq(busLocations.centreId, centreId));
    return routes.map((r) => { const l = locs.find((x) => x.routeId === r.id); const d = JSON.parse(r.data || '{}'); return { routeId: r.id, route: r.title, mine: !!me?.mobile && !!d.driverMobile && tail(me.mobile) === tail(d.driverMobile), vehicle: d.vehicle || null, driver: d.driver || null, driverMobile: d.driverMobile || null, status: r.status, position: l ? { lat: Number(l.lat), lng: Number(l.lng), speed: l.speed === null ? null : Number(l.speed), at: l.at, ageMin: Math.round((Date.now() - l.at.getTime()) / 60000), maps: mapsUrl(l.lat, l.lng), source: l.source } : null }; });
  }
  /** Parent / student: the bus(es) their children ride. */
  @Get('live/mine') async mine(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const kids = await myStudents(db, u, centreId); if (!kids.length) return [];
    const assigns = (await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'transport-assign'), eq(records.status, 'active')))).filter((a) => kids.some((k) => k.id === a.studentId) && a.refId);
    const out: any[] = []; for (const a of assigns) { const [rt] = await db.select().from(records).where(eq(records.id, a.refId!)); const [l] = await db.select().from(busLocations).where(eq(busLocations.routeId, a.refId!)); if (!rt) continue; const d = JSON.parse(rt.data || '{}'); const k = kids.find((x) => x.id === a.studentId) as any;
      out.push({ studentId: a.studentId, student: k?.name, route: rt.title, vehicle: d.vehicle || null, driver: d.driver || null, driverMobile: d.driverMobile || null, stop: a.title, pickupTime: JSON.parse(a.data || '{}').pickupTime || null, position: l ? { lat: Number(l.lat), lng: Number(l.lng), speed: l.speed === null ? null : Number(l.speed), at: l.at, ageMin: Math.round((Date.now() - l.at.getTime()) / 60000), maps: mapsUrl(l.lat, l.lng) } : null }); }
    return out;
  }
}
