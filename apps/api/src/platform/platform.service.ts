import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, planCatalog, students, subscriptionInvoices, users } from '../db/schema';
import { featuresFor, MODULES } from '../common/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaymentLink, razorpayReady } from '../integrations/razorpay';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
// The three Edge packs (prices live in the plan_catalog table and are set by the owner) plus the free demo package.
export const PLAN_PRESETS: Record<string, { price: number; features: string[] }> = {
  core: { price: 0, features: [...MODULES] },
  pro: { price: 0, features: [...MODULES] },
  elite: { price: 0, features: [...MODULES] },
  // Demo package: every module (school and coaching alike), free, never billed, never expires. For demos, trials-with-everything and internal testing.
  demo: { price: 0, features: [...MODULES] },
};
/** First-run price list = the prices the owner gave on 13 Nov 2026. All of it can be changed on Billing & plans > Packs & prices. */
export const PACK_DEFAULTS = [
  { key: 'core', name: 'Edge Core', tagline: 'Pay per student, per month', pricePerStudent: '10', minStudents: 0, setupFee: '0', yearlyPrice: '0', customAmount: '0', customCycle: 'yearly', customNote: null, sortOrder: 1 },
  { key: 'pro', name: 'Edge Pro', tagline: 'One-time setup plus a yearly package', pricePerStudent: '0', minStudents: 0, setupFee: '5000', yearlyPrice: '15000', customAmount: '0', customCycle: 'yearly', customNote: null, sortOrder: 2 },
  { key: 'elite', name: 'Edge Elite', tagline: 'A custom package for your institution', pricePerStudent: '0', minStudents: 0, setupFee: '0', yearlyPrice: '0', customAmount: '21000', customCycle: 'yearly', customNote: null, sortOrder: 3 },
] as const;
export const DEMO_CENTRE_NAMES = ['Demo Coaching Centre', 'Demo Public School'];

@Injectable()
export class PlatformService {
  private log = new Logger('Platform');
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  async settings(centreId: string) {
    const db = this.dbs.db; let [s] = await db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId));
    if (!s) { await db.insert(centreSettings).values({ centreId, trialEndsAt: addDays(today(), 30), features: JSON.stringify(PLAN_PRESETS.core.features) }).onConflictDoNothing(); [s] = await db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId)); }
    return { ...s, features: JSON.parse(s.features) as string[] };
  }
  /** The price list. Created on first use. */
  async packs() {
    const db = this.dbs.db; let rows = await db.select().from(planCatalog).orderBy(planCatalog.sortOrder);
    if (rows.length < PACK_DEFAULTS.length) { for (const d of PACK_DEFAULTS) if (!rows.some((r) => r.key === d.key)) await db.insert(planCatalog).values({ ...d } as any).onConflictDoNothing(); rows = await db.select().from(planCatalog).orderBy(planCatalog.sortOrder); }
    return rows;
  }
  /** What a client gets copied from the price list when it is put on a pack (the owner can then change that client's own numbers). */
  async packSettings(key: string) {
    const p = (await this.packs()).find((x) => x.key === key); if (!p) return {} as Record<string, any>;
    if (key === 'core') return { pricePerStudent: p.pricePerStudent, minStudents: p.minStudents, billingCycle: 'monthly', setupFee: '0', yearlyPrice: '0', customAmount: '0' };
    if (key === 'pro') return { pricePerStudent: '0', minStudents: 0, billingCycle: 'annual', setupFee: p.setupFee, yearlyPrice: p.yearlyPrice, customAmount: '0', setupPaid: false };
    return { pricePerStudent: '0', minStudents: 0, billingCycle: 'annual', setupFee: p.setupFee, yearlyPrice: '0', customAmount: p.customAmount, customCycle: p.customCycle, setupPaid: false }; // elite: standard amount, changed per client
  }
  /** Boot-time catch-up: centres created before a module existed get it if their type includes it (a coaching centre never gets school-only modules). */
  async migrateFeatures() {
    const db = this.dbs.db; await this.packs();
    await db.update(centres).set({ plan: 'core' }).where(sql`${centres.plan} in ('starter', 'standard')`); // old plan names become Edge Core
    // The two built-in demo clients run on the demo package so their logins never expire.
    for (const name of DEMO_CENTRE_NAMES) { const [c] = await db.select().from(centres).where(eq(centres.name, name)); if (c && c.plan !== 'demo') await db.update(centres).set({ plan: 'demo' }).where(eq(centres.id, c.id)); }
    const rows = await db.select({ id: centreSettings.centreId, f: centreSettings.features, t: centres.institutionType, plan: centres.plan, status: centreSettings.status }).from(centreSettings).innerJoin(centres, eq(centres.id, centreSettings.centreId));
    for (const r of rows) {
      if (r.plan === 'demo') { await db.update(centreSettings).set({ features: JSON.stringify([...MODULES]), status: 'active', pricePerStudent: '0', minStudents: 0, trialEndsAt: null, paidUntil: null, updatedAt: new Date() }).where(eq(centreSettings.centreId, r.id)); continue; }
      const cur: string[] = JSON.parse(r.f || '[]'); if (!cur.length) continue; const want = featuresFor(r.t || 'coaching').filter((m) => !cur.includes(m) && m === 'academics'); if (want.length) await db.update(centreSettings).set({ features: JSON.stringify([...cur, ...want]) }).where(eq(centreSettings.centreId, r.id));
    }
  }
  /** Modules this centre may use; empty list means everything. */
  async enabledModules(centreId: string): Promise<string[]> { const s = await this.settings(centreId); return s.features.length ? s.features : [...MODULES]; }

  async activeStudents(centreId: string) { const [{ n }] = await this.dbs.db.select({ n: sql<number>`count(*)` }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); return Number(n); }

  /** Creates (or returns) the invoice for the next period. Core = students x rate; Pro = yearly package (+ setup the first time); Elite = the amount agreed with this client (+ setup the first time). */
  async raiseInvoice(centreId: string) {
    const db = this.dbs.db; const [pc] = await db.select({ plan: centres.plan, name: centres.name }).from(centres).where(eq(centres.id, centreId)); if (pc?.plan === 'demo') throw new BadRequestException('The demo package is free and is never billed.');
    const [existing] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, centreId), eq(subscriptionInvoices.status, 'due'))); if (existing) return existing;
    const s = await this.settings(centreId); const plan = pc?.plan === 'pro' || pc?.plan === 'elite' ? pc.plan : 'core'; const actual = await this.activeStudents(centreId);
    const from = s.paidUntil ? addDays(s.paidUntil, 1) : today(); const setup = !s.setupPaid && plan !== 'core' ? Number(s.setupFee) : 0;
    let n = Math.max(s.minStudents, actual), rate = Number(s.pricePerStudent), amount = 0, days = 30, note = '';
    if (plan === 'core') { const annual = s.billingCycle === 'annual'; days = annual ? 365 : 30; amount = Math.round(n * rate * (annual ? 10 : 1)); note = `Edge Core: ${n} students x Rs ${rate}${annual ? ' x 10 months (2 months free)' : ' per month'}`; if (!(rate > 0)) throw new BadRequestException('Set the Edge Core price per student first (Billing & plans, Packs & prices, or this client\'s own price per student).'); }
    else if (plan === 'pro') { const y = Number(s.yearlyPrice); if (!(y > 0) && !(setup > 0)) throw new BadRequestException('Set the Edge Pro prices first (Billing & plans, Packs & prices, or this client\'s own setup and yearly price).'); days = 365; n = actual; rate = 0; amount = Math.round(y + setup); note = `Edge Pro: yearly package Rs ${y}${setup ? ` + one-time setup Rs ${setup}` : ''}`; }
    else { const a = Number(s.customAmount); if (!(a > 0) && !(setup > 0)) throw new BadRequestException('Set this client\'s Edge Elite amount first (Billing & plans, the client\'s Custom amount).'); const cyc = s.customCycle; days = cyc === 'monthly' ? 30 : cyc === 'quarterly' ? 90 : 365; n = actual; rate = 0; amount = Math.round(a + setup); note = `Edge Elite: custom package Rs ${a} ${cyc}${setup ? ` + one-time setup Rs ${setup}` : ''}${s.customNote ? ` (${s.customNote})` : ''}`; }
    const to = addDays(from, days);
    const [inv] = await db.insert(subscriptionInvoices).values({ centreId, periodFrom: from, periodTo: to, students: n, pricePerStudent: String(rate), amount: String(amount), plan, setupFee: String(setup), note }).returning();
    if (razorpayReady()) { try { const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const [admin] = await db.select().from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN')));
      const link = await createPaymentLink(amount, `NextEdge subscription · ${ce.name}`, { name: admin?.name || ce.name, contact: admin?.mobile || '9999999999' }, `sub-${inv.id}`, { subscriptionInvoiceId: inv.id, centreId });
      await db.update(subscriptionInvoices).set({ paymentLink: link.short_url }).where(eq(subscriptionInvoices.id, inv.id)); inv.paymentLink = link.short_url; } catch (e: any) { this.log.warn(`Razorpay link failed: ${e.message}`); } }
    return inv;
  }

  async markPaid(invoiceId: string, mode: string, reference?: string) {
    const db = this.dbs.db; const [inv] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, invoiceId)); if (!inv || inv.status === 'paid') return inv;
    await db.update(subscriptionInvoices).set({ status: 'paid', paidOn: today(), mode, reference: reference || inv.claimedRef || null }).where(eq(subscriptionInvoices.id, invoiceId));
    await db.update(centreSettings).set({ paidUntil: inv.periodTo, status: 'active', updatedAt: new Date(), ...(Number(inv.setupFee) > 0 ? { setupPaid: true } : {}) }).where(eq(centreSettings.centreId, inv.centreId));
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, inv.centreId), eq(users.role, 'ADMIN')));
    this.notify.notifyUsers(inv.centreId, admins.map((a) => a.id), 'Subscription renewed ✅', `Paid ₹${Number(inv.amount).toLocaleString('en-IN')} · active till ${inv.periodTo}.`, { data: { type: 'subscription' } });
    return { ...inv, status: 'paid' };
  }

  /** Daily: reminders at 7/3/1 days before expiry, on expiry → grace (7 days), after grace → suspended. */
  async renewalSweep() {
    const db = this.dbs.db; const all = await db.select().from(centreSettings); const t = today(); let touched = 0;
    const demoIds = new Set((await db.select({ id: centres.id }).from(centres).where(eq(centres.plan, 'demo'))).map((c) => c.id));
    for (const s of all) {
      if (demoIds.has(s.centreId)) continue; // demo package never expires
      const end = s.status === 'trial' ? s.trialEndsAt : s.paidUntil; if (!end) continue;
      const daysLeft = Math.round((new Date(end).getTime() - new Date(t).getTime()) / 864e5);
      const admins = (await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, s.centreId), eq(users.role, 'ADMIN')))).map((a) => a.id);
      const label = s.status === 'trial' ? 'free trial' : 'subscription';
      if ([7, 3, 1].includes(daysLeft)) { const inv = await this.raiseInvoice(s.centreId); this.notify.notifyUsers(s.centreId, admins, `Your ${label} ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`, `Renew for ₹${Number(inv.amount).toLocaleString('en-IN')} (${inv.students} students).${inv.paymentLink ? ' Pay: ' + inv.paymentLink : ' Pay at the platform or contact support.'}`, { urgent: true, data: { type: 'subscription' } }); touched++; }
      else if (daysLeft === 0 || (daysLeft < 0 && daysLeft >= -7 && s.status !== 'grace' && s.status !== 'suspended')) { await db.update(centreSettings).set({ status: 'grace', updatedAt: new Date() }).where(eq(centreSettings.centreId, s.centreId)); this.notify.notifyUsers(s.centreId, admins, `Your ${label} has ended`, 'You have 7 days of grace. Renew now to avoid suspension.', { urgent: true, data: { type: 'subscription' } }); touched++; }
      else if (daysLeft < -7 && s.status !== 'suspended') { await db.update(centreSettings).set({ status: 'suspended', updatedAt: new Date() }).where(eq(centreSettings.centreId, s.centreId)); this.notify.notifyUsers(s.centreId, admins, 'Account suspended', 'Renew to restore access for your staff, students and parents.', { urgent: true, data: { type: 'subscription' } }); touched++; }
    }
    this.log.log(`Renewal sweep: ${touched} centres touched`);
  }
}
