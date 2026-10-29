import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, students, subscriptionInvoices, users } from '../db/schema';
import { featuresFor, MODULES } from '../common/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaymentLink, razorpayReady } from '../integrations/razorpay';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(d).getTime() + n * 864e5).toISOString().slice(0, 10);
export const PLAN_PRESETS: Record<string, { price: number; features: string[] }> = {
  starter: { price: 25, features: ['students', 'attendance', 'fees', 'study', 'tests', 'homework', 'notices', 'chat', 'timetable', 'doubts', 'leaves', 'feedback', 'reports'] },
  standard: { price: 40, features: [...MODULES] },
  pro: { price: 60, features: [...MODULES] },
};

@Injectable()
export class PlatformService {
  private log = new Logger('Platform');
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  async settings(centreId: string) {
    const db = this.dbs.db; let [s] = await db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId));
    if (!s) { await db.insert(centreSettings).values({ centreId, trialEndsAt: addDays(today(), 30), features: JSON.stringify(PLAN_PRESETS.standard.features) }).onConflictDoNothing(); [s] = await db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId)); }
    return { ...s, features: JSON.parse(s.features) as string[] };
  }
  /** Boot-time catch-up: centres created before a module existed get it if their type includes it (a coaching centre never gets school-only modules). */
  async migrateFeatures() {
    const db = this.dbs.db; const rows = await db.select({ id: centreSettings.centreId, f: centreSettings.features, t: centres.institutionType }).from(centreSettings).innerJoin(centres, eq(centres.id, centreSettings.centreId));
    for (const r of rows) { const cur: string[] = JSON.parse(r.f || '[]'); if (!cur.length) continue; const want = featuresFor(r.t || 'coaching').filter((m) => !cur.includes(m) && m === 'academics'); if (want.length) await db.update(centreSettings).set({ features: JSON.stringify([...cur, ...want]) }).where(eq(centreSettings.centreId, r.id)); }
  }
  /** Modules this centre may use; empty list means everything. */
  async enabledModules(centreId: string): Promise<string[]> { const s = await this.settings(centreId); return s.features.length ? s.features : [...MODULES]; }

  async activeStudents(centreId: string) { const [{ n }] = await this.dbs.db.select({ n: sql<number>`count(*)` }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); return Number(n); }

  /** Creates (or returns) the invoice for the next period. */
  async raiseInvoice(centreId: string) {
    const db = this.dbs.db; const s = await this.settings(centreId); const n = Math.max(s.minStudents, await this.activeStudents(centreId));
    const from = s.paidUntil ? addDays(s.paidUntil, 1) : today(); const to = s.billingCycle === 'annual' ? addDays(from, 365) : addDays(from, 30);
    const [existing] = await db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, centreId), eq(subscriptionInvoices.status, 'due')));
    if (existing) return existing;
    const months = s.billingCycle === 'annual' ? 10 : 1; // annual = 2 months free
    const amount = Math.round(n * Number(s.pricePerStudent) * months);
    const [inv] = await db.insert(subscriptionInvoices).values({ centreId, periodFrom: from, periodTo: to, students: n, pricePerStudent: s.pricePerStudent, amount: String(amount) }).returning();
    if (razorpayReady()) { try { const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const [admin] = await db.select().from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN')));
      const link = await createPaymentLink(amount, `NextEdge subscription · ${ce.name}`, { name: admin?.name || ce.name, contact: admin?.mobile || '9999999999' }, `sub-${inv.id}`, { subscriptionInvoiceId: inv.id, centreId });
      await db.update(subscriptionInvoices).set({ paymentLink: link.short_url }).where(eq(subscriptionInvoices.id, inv.id)); inv.paymentLink = link.short_url; } catch (e: any) { this.log.warn(`Razorpay link failed: ${e.message}`); } }
    return inv;
  }

  async markPaid(invoiceId: string, mode: string, reference?: string) {
    const db = this.dbs.db; const [inv] = await db.select().from(subscriptionInvoices).where(eq(subscriptionInvoices.id, invoiceId)); if (!inv || inv.status === 'paid') return inv;
    await db.update(subscriptionInvoices).set({ status: 'paid', paidOn: today(), mode, reference: reference || inv.claimedRef || null }).where(eq(subscriptionInvoices.id, invoiceId));
    await db.update(centreSettings).set({ paidUntil: inv.periodTo, status: 'active', updatedAt: new Date() }).where(eq(centreSettings.centreId, inv.centreId));
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, inv.centreId), eq(users.role, 'ADMIN')));
    this.notify.notifyUsers(inv.centreId, admins.map((a) => a.id), 'Subscription renewed ✅', `Paid ₹${Number(inv.amount).toLocaleString('en-IN')} · active till ${inv.periodTo}.`, { data: { type: 'subscription' } });
    return { ...inv, status: 'paid' };
  }

  /** Daily: reminders at 7/3/1 days before expiry, on expiry → grace (7 days), after grace → suspended. */
  async renewalSweep() {
    const db = this.dbs.db; const all = await db.select().from(centreSettings); const t = today(); let touched = 0;
    for (const s of all) {
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
