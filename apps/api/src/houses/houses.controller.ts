import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { houseRoles, housePoints, houses, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { HOUSE_COLOURS, ROLE_SUGGESTIONS, cleanHouse, distribute, rankHouses } from './houses';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const MANAGE = ['SUPER_ADMIN', 'ADMIN', 'STAFF'] as const; // office and the owner organise houses
const POINTS = ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'FACULTY'] as const; // teachers can award points too

/** Houses for a school: Red / Blue / ... with a house master, a captain and other roles, and inter-house points. */
@Controller('houses')
export class HousesController {
  constructor(private dbs: DbService) {}

  /** Houses with strength, boys/girls, points, rank, the teacher in charge and the captains. */
  private async overview(centreId: string) {
    const db = this.dbs.db; const hs = await db.select().from(houses).where(eq(houses.centreId, centreId)).orderBy(houses.sortOrder, houses.name);
    const sts = await db.select({ id: students.id, name: students.name, gender: students.gender, houseId: students.houseId, className: students.className }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true)));
    const pts = await db.select({ houseId: housePoints.houseId, p: sql<number>`coalesce(sum(${housePoints.points}), 0)` }).from(housePoints).where(eq(housePoints.centreId, centreId)).groupBy(housePoints.houseId);
    const rl = await db.select({ id: houseRoles.id, houseId: houseRoles.houseId, title: houseRoles.title, studentId: houseRoles.studentId, name: students.name, className: students.className }).from(houseRoles).innerJoin(students, eq(students.id, houseRoles.studentId)).where(eq(houseRoles.centreId, centreId)).orderBy(houseRoles.createdAt);
    const masters = hs.some((h) => h.masterId) ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, hs.map((h) => h.masterId).filter((x): x is string => !!x))) : [];
    const rows = hs.map((h) => { const m = sts.filter((s) => s.houseId === h.id); return { id: h.id, name: h.name, colour: h.colour, motto: h.motto || '', masterId: h.masterId, master: masters.find((x) => x.id === h.masterId)?.name || '', strength: m.length, boys: m.filter((s) => s.gender === 'Male').length, girls: m.filter((s) => s.gender === 'Female').length, points: Number(pts.find((p) => p.houseId === h.id)?.p || 0), roles: rl.filter((r) => r.houseId === h.id) }; });
    const known = new Set(hs.map((h) => h.id));
    return { houses: rankHouses(rows), unassigned: sts.filter((s) => !s.houseId || !known.has(s.houseId)).length, students: sts.length, colours: HOUSE_COLOURS, roleSuggestions: ROLE_SUGGESTIONS };
  }
  @Get() @Roles(...POINTS) list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { return this.overview(centreOf(u, c)); }

  /** A student's (or parent's) own house card: house, roles, points, rank, and the house's latest points. */
  @Get('mine') async mine(@CurrentUser() u: JwtUser, @Query('studentId') studentId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const kids = await myStudents(db, u, centreId); const kid = (studentId && kids.find((k) => k.id === studentId)) || kids[0]; if (!kid) return null;
    const [row] = await db.select({ houseId: students.houseId }).from(students).where(eq(students.id, kid.id)); if (!row?.houseId) return { house: null };
    const ov = await this.overview(centreId); const h = ov.houses.find((x) => x.id === row.houseId); if (!h) return { house: null };
    const log = await db.select({ points: housePoints.points, reason: housePoints.reason, date: housePoints.date, studentId: housePoints.studentId }).from(housePoints).where(eq(housePoints.houseId, h.id)).orderBy(desc(housePoints.date), desc(housePoints.createdAt)).limit(8);
    const myRoles = h.roles.filter((r) => r.studentId === kid.id).map((r) => r.title);
    const mine = await db.select({ p: sql<number>`coalesce(sum(${housePoints.points}), 0)` }).from(housePoints).where(and(eq(housePoints.houseId, h.id), eq(housePoints.studentId, kid.id)));
    return { house: h, rankOf: ov.houses.length, myRoles, myPoints: Number(mine[0]?.p || 0), recent: log.map((l) => ({ ...l, mine: l.studentId === kid.id })) };
  }

  @Post() @Roles(...MANAGE) async add(@CurrentUser() u: JwtUser, @Body() b: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const r = cleanHouse(b); if ('error' in r) throw new BadRequestException(r.error); const db = this.dbs.db;
    const have = await db.select({ name: houses.name, n: houses.sortOrder }).from(houses).where(eq(houses.centreId, centreId)); if (have.some((h) => h.name.toLowerCase() === r.ok.name.toLowerCase())) throw new BadRequestException(`A house named ${r.ok.name} already exists.`);
    const colour = b?.colour ? r.ok.colour : HOUSE_COLOURS[have.length % HOUSE_COLOURS.length];
    const [row] = await db.insert(houses).values({ centreId, name: r.ok.name, colour, motto: r.ok.motto || null, masterId: b?.masterId || null, sortOrder: have.length }).returning(); return { id: row.id };
  }
  @Put(':id') @Roles(...MANAGE) async edit(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const r = cleanHouse(b); if ('error' in r) throw new BadRequestException(r.error); const db = this.dbs.db;
    const dup = await db.select({ id: houses.id, name: houses.name }).from(houses).where(eq(houses.centreId, centreId)); if (dup.some((h) => h.id !== id && h.name.toLowerCase() === r.ok.name.toLowerCase())) throw new BadRequestException(`A house named ${r.ok.name} already exists.`);
    const [row] = await db.update(houses).set({ name: r.ok.name, colour: r.ok.colour, motto: r.ok.motto || null, masterId: b?.masterId || null }).where(and(eq(houses.id, id), eq(houses.centreId, centreId))).returning(); if (!row) throw new NotFoundException(); return { ok: true };
  }
  /** Deleting a house frees its students (they become unassigned) and removes its roles; the points log goes with it. */
  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [h] = await db.select({ id: houses.id }).from(houses).where(and(eq(houses.id, id), eq(houses.centreId, centreId))); if (!h) throw new NotFoundException();
    await db.update(students).set({ houseId: null }).where(and(eq(students.centreId, centreId), eq(students.houseId, id)));
    await db.delete(houseRoles).where(eq(houseRoles.houseId, id)); await db.delete(housePoints).where(eq(housePoints.houseId, id)); await db.delete(houses).where(eq(houses.id, id)); return { ok: true };
  }

  /** Put students in a house (houseId empty = take them out of any house). */
  @Put('assign/bulk') @Roles(...MANAGE) async assign(@CurrentUser() u: JwtUser, @Body() b: { studentIds: string[]; houseId?: string | null }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const ids = (b?.studentIds || []).slice(0, 2000); if (!ids.length) throw new BadRequestException('Choose at least one student.');
    if (b?.houseId) { const [h] = await db.select({ id: houses.id }).from(houses).where(and(eq(houses.id, b.houseId), eq(houses.centreId, centreId))); if (!h) throw new BadRequestException('Choose a house.'); }
    await db.update(students).set({ houseId: b?.houseId || null }).where(and(eq(students.centreId, centreId), inArray(students.id, ids)));
    if (!b?.houseId) await db.delete(houseRoles).where(and(eq(houseRoles.centreId, centreId), inArray(houseRoles.studentId, ids))); // a child with no house cannot be captain
    return { ok: true, count: ids.length };
  }
  /** Share every student who has no house equally between the houses (boys and girls separately). Nobody who already has a house is moved. */
  @Post('auto-assign') @Roles(...MANAGE) async auto(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const hs = await db.select({ id: houses.id }).from(houses).where(eq(houses.centreId, centreId)); if (!hs.length) throw new BadRequestException('Add the houses first.');
    const sts = await db.select({ id: students.id, name: students.name, gender: students.gender, houseId: students.houseId }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true)));
    const plan = distribute(sts, hs.map((h) => h.id)); for (const h of hs) { const ids = plan.filter((p) => p.houseId === h.id).map((p) => p.studentId); if (ids.length) await db.update(students).set({ houseId: h.id }).where(inArray(students.id, ids)); }
    return { ok: true, assigned: plan.length };
  }

  // ---------- roles: captain, vice captain and anything else the school wants ----------
  @Post('roles') @Roles(...MANAGE) async addRole(@CurrentUser() u: JwtUser, @Body() b: { houseId: string; studentId: string; title: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const title = String(b?.title || '').trim().slice(0, 40); if (!title) throw new BadRequestException('Enter the role, for example House Captain.');
    const [st] = await db.select({ houseId: students.houseId }).from(students).where(and(eq(students.id, b?.studentId || ''), eq(students.centreId, centreId))); if (!st) throw new BadRequestException('Choose a student.');
    if (st.houseId !== b.houseId) throw new BadRequestException('This student is not in that house. Put the student in the house first.');
    const have = await db.select().from(houseRoles).where(and(eq(houseRoles.houseId, b.houseId), eq(houseRoles.studentId, b.studentId))); if (have.some((r) => r.title.toLowerCase() === title.toLowerCase())) throw new BadRequestException('This student already has that role.');
    if (/captain/i.test(title) && !/^(vice|sports|cultural|discipline)/i.test(title)) { // one House Captain per house: a new one replaces the old
      const same = await db.select().from(houseRoles).where(and(eq(houseRoles.houseId, b.houseId))); const old = same.filter((r) => r.title.toLowerCase() === title.toLowerCase()); if (old.length) await db.delete(houseRoles).where(inArray(houseRoles.id, old.map((o) => o.id)));
    }
    await db.insert(houseRoles).values({ centreId, houseId: b.houseId, studentId: b.studentId, title }); return { ok: true };
  }
  @Delete('roles/:id') @Roles(...MANAGE) async removeRole(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) { await this.dbs.db.delete(houseRoles).where(and(eq(houseRoles.id, id), eq(houseRoles.centreId, centreOf(u, c)))); return { ok: true }; }

  // ---------- points ----------
  @Get('points') @Roles(...POINTS) async log(@CurrentUser() u: JwtUser, @Query('houseId') houseId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const cond = [eq(housePoints.centreId, centreId)]; if (houseId) cond.push(eq(housePoints.houseId, houseId));
    return this.dbs.db.select({ id: housePoints.id, houseId: housePoints.houseId, points: housePoints.points, reason: housePoints.reason, date: housePoints.date, studentName: students.name }).from(housePoints).leftJoin(students, eq(students.id, housePoints.studentId)).where(and(...cond)).orderBy(desc(housePoints.date), desc(housePoints.createdAt)).limit(200);
  }
  @Post('points') @Roles(...POINTS) async addPoints(@CurrentUser() u: JwtUser, @Body() b: { houseId: string; points: number; reason: string; studentId?: string; date?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const pts = Math.round(Number(b?.points)); if (!(Number.isFinite(pts) && pts !== 0 && Math.abs(pts) <= 1000)) throw new BadRequestException('Points must be a whole number between -1000 and 1000, not zero.');
    const reason = String(b?.reason || '').trim().slice(0, 120); if (!reason) throw new BadRequestException('Write the reason, for example “Won the relay race”.');
    const [h] = await db.select({ id: houses.id }).from(houses).where(and(eq(houses.id, b?.houseId || ''), eq(houses.centreId, centreId))); if (!h) throw new BadRequestException('Choose a house.');
    let studentId: string | null = null; if (b?.studentId) { const [st] = await db.select({ id: students.id, houseId: students.houseId }).from(students).where(and(eq(students.id, b.studentId), eq(students.centreId, centreId))); if (!st || st.houseId !== b.houseId) throw new BadRequestException('That student is not in this house.'); studentId = st.id; }
    const date = b?.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today(); await db.insert(housePoints).values({ centreId, houseId: b.houseId, studentId, points: pts, reason, date, createdBy: u.id }); return { ok: true };
  }
  @Delete('points/:id') @Roles('SUPER_ADMIN', 'ADMIN') async removePoints(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) { await this.dbs.db.delete(housePoints).where(and(eq(housePoints.id, id), eq(housePoints.centreId, centreOf(u, c)))); return { ok: true }; }
}
