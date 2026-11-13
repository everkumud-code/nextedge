import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, couponRedemptions, coupons, planCatalog, students, subscriptionInvoices, users } from '../db/schema';
import { discountFor, label as couponLabel, whyNot, type CouponRow } from './coupons';
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
/** First-run price list = the prices the owner gave on 13 Nov 2026: two packs only, Pro and Elite, one-time setup 71,402 and 18,905 a year. All of it can be changed on Billing & plans > Packs & prices. */
export const PACK_DEFAULTS = [
  { key: 'pro', name: 'Edge Pro', tagline: 'One-time setup plus a yearly package', pricePerStudent: '0', minStudents: 0, setupFee: '71402', yearlyPrice: '18905', customAmount: '0', customCycle: 'yearly', customNote: null, sortOrder: 1 },
  { key: 'elite', name: 'Edge Elite', tagline: 'One-time setup plus a yearly package', pricePerStudent: '0', minStudents: 0, setupFee: '71402', yearlyPrice: '18905', customAmount: '0', customCycle: 'yearly', customNote: null, sortOrder: 2 },
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
    // there is no other pack: the old pay-per-student one disappears once no client is on it
    if (rows.some((r) => r.key === 'core') && !(await db.select({ id: centres.id }).from(centres).where(eq(centres.plan, 'core')).limit(1)).length) { await db.delete(planCatalog).where(eq(planCatalog.key, 'core')); rows = rows.filter((r) => r.key !== 'core'); }
    return rows;
  }
  /** What a client gets copied from the price list when it is put on a pack (the owner can then change that client's own numbers). */
  async packSettings(key: string) {
    const p = (await this.packs()).find((x) => x.key === key); if (!p) return {} as Record<string, any>;
    return { pricePerStudent: '0', minStudents: 0, billingCycle: 'annual', setupFee: p.setupFee, yearlyPrice: p.yearlyPrice, customAmount: '0', setupPaid: false };   // Pro and Elite: one-time setup + yearly package
  }
  /** Boot-time catch-up: centres created before a module existed get it if their type includes it (a coaching centre never gets school-only modules). */
  async migrateFeatures() {
    const db = this.dbs.db; await this.packs();
    await db.update(centres).set({ plan: 'pro' }).where(sql`${centres.plan} in ('starter', 'standard')`); // old plan names become Edge Pro
    for (const c of await db.select({ id: centres.id }).from(centres).where(eq(centres.plan, 'core'))) { await db.update(centres).set({ plan: 'pro' }).where(eq(centres.id, c.id)); await this.settings(c.id); await db.update(centreSettings).set({ ...(await this.packSettings('pro')), updatedAt: new Date() } as any).where(eq(centreSettings.centreId, c.id)); } // the pay-per-student pack is gone
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

  // ---------- coupons ----------
  toRow(c: typeof coupons.$inferSelect): CouponRow { return { code: c.code, kind: c.kind === 'amount' ? 'amount' : 'percent', value: Number(c.value), plans: JSON.parse(c.plans || '[]'), scope: c.scope === 'every' ? 'every' : 'first', validFrom: c.validFrom, validTo: c.validTo, maxUses: c.maxUses, usedCount: c.usedCount, active: c.active }; }
  async hasPaid(centreId: string) { const [{ n }] = await this.dbs.db.select({ n: sql<number>`count(*)` }).from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, centreId), eq(subscriptionInvoices.status, 'paid'))); return Number(n) > 0; }
  /** Puts a coupon on a client (the owner does it, or the client types the code). Throws with a plain reason when it cannot be used. */
  async attachCoupon(centreId: string, rawCode: string) {
    const db = this.dbs.db; const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9_-]/g, ''); if (!code) throw new BadRequestException('Enter a coupon code.');
    const [c] = await db.select().from(coupons).where(eq(coupons.code, code)); if (!c) throw new BadRequestException('This coupon code is not valid.');
    const [pc] = await db.select({ plan: centres.plan }).from(centres).where(eq(centres.id, centreId)); const why = whyNot(this.toRow(c), { plan: pc?.plan || 'core', today: today(), hasPaid: await this.hasPaid(centreId) }); if (why) throw new BadRequestException(why);
    await db.update(centreSettings).set({ couponCode: code, updatedAt: new Date() }).where(eq(centreSettings.centreId, centreId));
    const [due] = await db.select({ id: subscriptionInvoices.id }).from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, centreId), eq(subscriptionInvoices.status, 'due')));
    return { ok: true, code, label: couponLabel(this.toRow(c)), dueInvoice: !!due };
  }
  async detachCoupon(centreId: string) { await this.dbs.db.update(centreSettings).set({ couponCode: null, updatedAt: new Date() }).where(eq(centreSettings.centreId, centreId)); return { ok: true }; }
  /** The discount the attached coupon gives on an invoice of `amount` right now, or null (no coupon, or it no longer applies: it stays attached and is checked again next time). */
  async couponFor(centreId: string, plan: string, amount: number): Promise<{ row: CouponRow; discount: number } | null> {
    const db = this.dbs.db; const s: any = await this.settings(centreId); if (!s.couponCode) return null;
    const [c] = await db.select().from(coupons).where(eq(coupons.code, s.couponCode)); if (!c) return null; const row = this.toRow(c);
    if (whyNot(row, { plan, today: today(), hasPaid: await this.hasPaid(centreId) })) return null; const discount = discountFor(row, amount); return discount > 0 ? { row, discount } : null;
  }
  /** What the client sees about its coupon on the Subscription page. */
  async couponStatus(centreId: string, plan: string, estimate: number) {
    const db = this.dbs.db; const s: any = await this.settings(centreId); if (!s.couponCode) return null;
    const [c] = await db.select().from(coupons).where(eq(coupons.code, s.couponCode)); if (!c) return { code: s.couponCode, label: '', problem: 'This coupon no longer exists.', discountNext: 0 };
    const row = this.toRow(c); const problem = whyNot(row, { plan, today: today(), hasPaid: await this.hasPaid(centreId) });
    return { code: row.code, label: couponLabel(row), scope: row.scope, validTo: row.validTo, problem, discountNext: problem ? 0 : discountFor(row, estimate) };
  }

  /** Creates (or returns) the invoice for the next period. Core = students x rate; Pro = yearly package (+ setup the first time); Elite = the amount agreed with this client (+ setup the first time). */
  async raiseInvoice(centreId: string) {
    const db = this.dbs.db; const [pc] = await db.select({ plan: centres.plan, name: centres.name }).from(centres).where(eq(centres.id, centreId)); if (pc?.plan === 'demo') throw new BadRequestException('The demo package is free and is never billed.');
    const [existing] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, centreId), eq(subscriptionInvoices.status, 'due'))); if (existing) return existing;
    const s = await this.settings(centreId); const plan = pc?.plan === 'pro' || pc?.plan === 'elite' ? pc.plan : 'core'; const actual = await this.activeStudents(centreId);
    const from = s.paidUntil ? addDays(s.paidUntil, 1) : today(); const setup = !s.setupPaid && plan !== 'core' ? Number(s.setupFee) : 0;
    let n = Math.max(s.minStudents, actual), rate = Number(s.pricePerStudent), amount = 0, days = 30, note = '';
    if (plan === 'core') { const annual = s.billingCycle === 'annual'; days = annual ? 365 : 30; amount = Math.round(n * rate * (annual ? 10 : 1)); note = `Edge Core: ${n} students x Rs ${rate}${annual ? ' x 10 months (2 months free)' : ' per month'}`; if (!(rate > 0)) throw new BadRequestException('Set the Edge Core price per student first (Billing & plans, Packs & prices, or this client\'s own price per student).'); }
    else { const y = Number(s.yearlyPrice); const label = plan === 'elite' ? 'Edge Elite' : 'Edge Pro'; if (!(y > 0) && !(setup > 0)) throw new BadRequestException(`Set the ${label} prices first (Billing & plans, Packs & prices, or this client's own setup and yearly price).`); days = 365; n = actual; rate = 0; amount = Math.round(y + setup); note = `${label}: yearly package Rs ${y}${setup ? ` + one-time setup Rs ${setup}` : ''}`; }
    const cp = await this.couponFor(centreId, plan, amount); let discount = 0; if (cp) { discount = cp.discount; amount -= discount; note += ` - coupon ${cp.row.code} (${couponLabel(cp.row)}): Rs ${discount} off`; }
    const to = addDays(from, days);
    const [inv] = await db.insert(subscriptionInvoices).values({ centreId, periodFrom: from, periodTo: to, students: n, pricePerStudent: String(rate), amount: String(amount), plan, setupFee: String(setup), note, discount: String(discount), couponCode: cp ? cp.row.code : null }).returning();
    if (amount <= 0) { await this.markPaid(inv.id, 'coupon', cp ? `Coupon ${cp.row.code}` : undefined); return { ...inv, status: 'paid' }; } // a 100% coupon: nothing to pay
    if (razorpayReady()) { try { const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const [admin] = await db.select().from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN')));
      const link = await createPaymentLink(amount, `NextEdge subscription · ${ce.name}`, { name: admin?.name || ce.name, contact: admin?.mobile || '9999999999' }, `sub-${inv.id}`, { subscriptionInvoiceId: inv.id, centreId });
      await db.update(subscriptionInvoices).set({ paymentLink: link.short_url }).where(eq(subscriptionInvoices.id, inv.id)); inv.paymentLink = link.short_url; } catch (e: any) { this.log.warn(`Razorpay link failed: ${e.message}`); } }
    return inv;
  }

  async markPaid(invoiceId: string, mode: string, reference?: string) {
    const db = this.dbs.db; const [inv] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, invoiceId)); if (!inv || inv.status === 'paid') return inv;
    await db.update(subscriptionInvoices).set({ status: 'paid', paidOn: today(), mode, reference: reference || inv.claimedRef || null }).where(eq(subscriptionInvoices.id, invoiceId));
    if (inv.couponCode) { const [cp] = await db.select().from(coupons).where(eq(coupons.code, inv.couponCode)); if (cp) { await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, cp.id)); await db.insert(couponRedemptions).values({ couponId: cp.id, centreId: inv.centreId, invoiceId: inv.id, discount: inv.discount }); } }
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
