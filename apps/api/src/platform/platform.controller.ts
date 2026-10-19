import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, students, subscriptionInvoices } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { MODULES } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { PLAN_PRESETS, PlatformService } from './platform.service';

/** Super-admin console: per-centre features, plan, billing, provider. */
@Controller('platform')
@Roles('SUPER_ADMIN')
export class PlatformController {
  constructor(private dbs: DbService, private svc: PlatformService) {}

  @Get('modules') modules() { return MODULES; }
  @Get('plans') plans() { return PLAN_PRESETS; }

  /** All centres with settings, student count, open invoice. */
  @Get('centres') async list() {
    const db = this.dbs.db; const rows = await db.select().from(centres).orderBy(centres.name); const out = [];
    for (const c of rows) { const s = await this.svc.settings(c.id); const n = await this.svc.activeStudents(c.id);
      const [inv] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, c.id), eq(subscriptionInvoices.status, 'due')));
      out.push({ ...c, settings: s, activeStudents: n, openInvoice: inv || null }); }
    return out;
  }

  @Put('centres/:id/settings') async update(@Param('id') id: string, @Body() b: Partial<{ features: string[]; pricePerStudent: number; minStudents: number; billingCycle: string; plan: string; status: string; paidUntil: string; trialEndsAt: string; liveProvider: string; zoomAccountId: string; zoomClientId: string; zoomClientSecret: string; defaultMeetingUrl: string }>) {
    const db = this.dbs.db; await this.svc.settings(id); const set: any = { updatedAt: new Date() };
    if (b.plan && PLAN_PRESETS[b.plan]) { await db.update(centres).set({ plan: b.plan }).where(eq(centres.id, id)); set.pricePerStudent = String(PLAN_PRESETS[b.plan].price); set.features = JSON.stringify(PLAN_PRESETS[b.plan].features); }
    if (b.features) set.features = JSON.stringify(b.features.filter((m) => (MODULES as readonly string[]).includes(m)));
    if (b.pricePerStudent !== undefined) set.pricePerStudent = String(b.pricePerStudent);
    for (const k of ['minStudents', 'billingCycle', 'status', 'paidUntil', 'trialEndsAt', 'liveProvider', 'zoomAccountId', 'zoomClientId', 'zoomClientSecret', 'defaultMeetingUrl'] as const) if (b[k] !== undefined) set[k] = b[k];
    await db.update(centreSettings).set(set).where(eq(centreSettings.centreId, id));
    return this.svc.settings(id);
  }

  @Get('centres/:id/invoices') invoices(@Param('id') id: string) { return this.dbs.db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.centreId, id)).orderBy(desc(subscriptionInvoices.createdAt)); }
  @Post('centres/:id/invoice') raise(@Param('id') id: string) { return this.svc.raiseInvoice(id); }
  @Post('invoices/:id/paid') paid(@Param('id') id: string, @Body() b: { mode: string; reference?: string }) { return this.svc.markPaid(id, b.mode || 'manual', b.reference); }
  @Post('invoices/:id/void') async voidInv(@Param('id') id: string) { await this.dbs.db.update(subscriptionInvoices).set({ status: 'void' }).where(eq(subscriptionInvoices.id, id)); return { ok: true }; }

  /** Revenue overview. */
  @Get('summary') async summary() {
    const db = this.dbs.db;
    const [{ centresN }] = await db.select({ centresN: sql<number>`count(*)` }).from(centres);
    const [{ studentsN }] = await db.select({ studentsN: sql<number>`count(*)` }).from(students).where(eq(students.active, true));
    const [m] = await db.select({ paid: sql<string>`coalesce(sum(${subscriptionInvoices.amount}) filter (where ${subscriptionInvoices.status} = 'paid' and date_trunc('month', ${subscriptionInvoices.paidOn}) = date_trunc('month', current_date)), 0)`, due: sql<string>`coalesce(sum(${subscriptionInvoices.amount}) filter (where ${subscriptionInvoices.status} = 'due'), 0)` }).from(subscriptionInvoices);
    const st = await db.select({ status: centreSettings.status, n: sql<number>`count(*)` }).from(centreSettings).groupBy(centreSettings.status);
    return { centres: Number(centresN), activeStudents: Number(studentsN), collectedThisMonth: Number(m.paid), outstanding: Number(m.due), byStatus: Object.fromEntries(st.map((x) => [x.status, Number(x.n)])) };
  }
}

/** What a centre's own admin can see about their subscription (read-only + pay link). */
@Controller('subscription')
export class SubscriptionController {
  constructor(private dbs: DbService, private svc: PlatformService) {}
  @Get() async mine(@CurrentUser() u: JwtUser) {
    if (!u.centreId) return null; const s = await this.svc.settings(u.centreId); const n = await this.svc.activeStudents(u.centreId);
    const [inv] = await this.dbs.db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, u.centreId), eq(subscriptionInvoices.status, 'due')));
    const { zoomClientSecret, zoomClientId, zoomAccountId, ...safe } = s as any;
    return { ...safe, activeStudents: n, openInvoice: inv || null, estimateNext: Math.max(s.minStudents, n) * Number(s.pricePerStudent) * (s.billingCycle === 'annual' ? 10 : 1) };
  }
  @Post('invoice') @Roles('ADMIN') async raise(@CurrentUser() u: JwtUser) { return this.svc.raiseInvoice(u.centreId!); }
  /** Owner picks how live classes run: jitsi | zoom (needs Zoom S2S keys) | meet | teams | custom (standing link). */
  @Put('live-provider') @Roles('ADMIN') async provider(@CurrentUser() u: JwtUser, @Body() b: { liveProvider: string; zoomAccountId?: string; zoomClientId?: string; zoomClientSecret?: string; defaultMeetingUrl?: string }) {
    await this.svc.settings(u.centreId!); const set: any = { liveProvider: b.liveProvider, updatedAt: new Date() };
    for (const k of ['zoomAccountId', 'zoomClientId', 'zoomClientSecret', 'defaultMeetingUrl'] as const) if (b[k] !== undefined) set[k] = b[k] || null;
    await this.dbs.db.update(centreSettings).set(set).where(eq(centreSettings.centreId, u.centreId!)); return { ok: true };
  }
}
