import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres, platformTeam, staffPermissions, users } from '../db/schema';
import { Roles, invalidateBlocked } from '../common/auth.guard';
import { MODULES } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';

const SALES_TITLE = 'Sales demo';
/** Sales people may use every module of a demo centre except managing its staff, so a demo cannot lock anyone out. */
const SALES_MODULES = (MODULES as readonly string[]).filter((m) => m !== 'staff');
const clean = (b: any) => ({ name: String(b?.name || '').trim().slice(0, 80), mobile: String(b?.mobile || '').replace(/\D/g, ''), email: String(b?.email || '').trim().toLowerCase(), title: String(b?.title || '').trim().slice(0, 60) });
const check = (x: { name: string; mobile: string; email: string }) => {
  if (!x.name) throw new BadRequestException('Enter the person’s name');
  if (!/^\d{10}$/.test(x.mobile)) throw new BadRequestException('Mobile must be 10 digits');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.email)) throw new BadRequestException('Enter a valid email: it is their login and the one-time code is sent there');
};

/**
 * Platform team (owner only):
 *  - managers: people who help run NextEdge (clients, billing, messaging). They log in as "Platform" with their email.
 *  - sales: people who show demos. They are added as staff of the demo centres and log in with the centre name and their email.
 */
@Controller('platform/team')
@Roles('SUPER_ADMIN')
export class PlatformTeamController {
  constructor(private dbs: DbService) {}
  private async ownerOnly(u: JwtUser) { const [t] = await this.dbs.db.select({ id: platformTeam.userId }).from(platformTeam).where(eq(platformTeam.userId, u.id)); if (t) throw new ForbiddenException('Only the platform owner can manage the team.'); }

  @Get() async list(@CurrentUser() u: JwtUser) {
    await this.ownerOnly(u); const db = this.dbs.db;
    const mg = await db.select({ id: users.id, name: users.name, email: users.email, mobile: users.mobile, createdAt: users.createdAt, row: platformTeam.userId, title: platformTeam.title, active: platformTeam.active }).from(users).leftJoin(platformTeam, eq(platformTeam.userId, users.id)).where(and(eq(users.role, 'SUPER_ADMIN'), isNull(users.centreId)));
    const managers = mg.map((m) => ({ id: m.id, name: m.name, email: m.email, mobile: m.mobile, title: m.title || (m.row ? '' : 'Owner'), owner: !m.row, active: m.row ? !!m.active : true, createdAt: m.createdAt }));
    const demoCentres = await db.select({ id: centres.id, name: centres.name, type: centres.institutionType }).from(centres).where(eq(centres.plan, 'demo')).orderBy(centres.name);
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, mobile: users.mobile, centreId: users.centreId, centreName: centres.name, active: staffPermissions.active }).from(staffPermissions).innerJoin(users, eq(users.id, staffPermissions.userId)).innerJoin(centres, eq(centres.id, users.centreId)).where(eq(staffPermissions.title, SALES_TITLE));
    const byMail = new Map<string, any>();
    for (const r of rows) { const k = (r.email || r.mobile).toLowerCase(); const x = byMail.get(k) || { key: k, name: r.name, email: r.email, mobile: r.mobile, active: true, centres: [] as string[] }; x.centres.push(r.centreName); if (r.active === false) x.active = false; byMail.set(k, x); }
    return { managers, sales: [...byMail.values()], demoCentres };
  }

  /** Add a person. kind=manager → platform login; kind=sales → staff of the chosen demo centres (default: all demo centres). */
  @Post() async add(@CurrentUser() u: JwtUser, @Body() b: { kind: 'manager' | 'sales'; name: string; mobile: string; email: string; title?: string; centreIds?: string[] }) {
    await this.ownerOnly(u); const db = this.dbs.db; const x = clean(b); check(x);
    if (b.kind === 'manager') {
      const same = await db.select({ id: users.id, email: users.email, mobile: users.mobile }).from(users).where(and(isNull(users.centreId)));
      if (same.some((r) => r.email === x.email || r.mobile === x.mobile)) throw new BadRequestException('A platform user with this email or mobile already exists');
      const [user] = await db.insert(users).values({ centreId: null, name: x.name, mobile: x.mobile, email: x.email, role: 'SUPER_ADMIN' }).returning();
      await db.insert(platformTeam).values({ userId: user.id, title: x.title || 'Platform manager' });
      return { ok: true, login: { centre: 'Platform', email: x.email }, id: user.id };
    }
    if (b.kind !== 'sales') throw new BadRequestException('Choose manager or sales');
    const all = await db.select({ id: centres.id, name: centres.name }).from(centres).where(eq(centres.plan, 'demo')); if (!all.length) throw new BadRequestException('There is no demo centre to give access to');
    const chosen = b.centreIds?.length ? all.filter((c) => b.centreIds!.includes(c.id)) : all; if (!chosen.length) throw new BadRequestException('Choose at least one demo centre');
    const made: string[] = []; const skipped: string[] = [];
    for (const c of chosen) {
      const ex = await db.select({ id: users.id, email: users.email, mobile: users.mobile }).from(users).where(and(eq(users.centreId, c.id), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF', 'STUDENT', 'PARENT'])));
      if (ex.some((r) => r.email === x.email || r.mobile === x.mobile)) { skipped.push(`${c.name} (this email or mobile is already used there)`); continue; }
      const [user] = await db.insert(users).values({ centreId: c.id, name: x.name, mobile: x.mobile, email: x.email, role: 'STAFF' }).returning();
      await db.insert(staffPermissions).values({ userId: user.id, centreId: c.id, modules: JSON.stringify(SALES_MODULES), title: SALES_TITLE }); made.push(c.name);
    }
    if (!made.length) throw new BadRequestException(`Nothing was added: ${skipped.join('; ')}`);
    return { ok: true, login: { centres: made, email: x.email }, skipped };
  }

  /** Switch a manager on or off. */
  @Put('manager/:id/active') async setManager(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { active: boolean }) {
    await this.ownerOnly(u); const [t] = await this.dbs.db.select().from(platformTeam).where(eq(platformTeam.userId, id)); if (!t) throw new BadRequestException('The owner account cannot be switched off here');
    await this.dbs.db.update(platformTeam).set({ active: !!b.active }).where(eq(platformTeam.userId, id)); invalidateBlocked(); return { ok: true };
  }
  /** Switch a sales person on or off in every demo centre at once. */
  @Put('sales/active') async setSales(@CurrentUser() u: JwtUser, @Body() b: { email: string; active: boolean }) {
    await this.ownerOnly(u); const db = this.dbs.db; const em = String(b.email || '').toLowerCase(); if (!em) throw new BadRequestException('Email missing');
    const ids = (await db.select({ id: users.id }).from(users).innerJoin(staffPermissions, eq(staffPermissions.userId, users.id)).where(and(eq(users.email, em), eq(staffPermissions.title, SALES_TITLE)))).map((r) => r.id);
    if (!ids.length) throw new BadRequestException('Sales person not found');
    await db.update(staffPermissions).set({ active: !!b.active }).where(inArray(staffPermissions.userId, ids)); invalidateBlocked(); return { ok: true, changed: ids.length };
  }
}
