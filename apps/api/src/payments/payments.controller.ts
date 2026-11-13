import { Body, Controller, Get, Param, Post, Put, Query, Req, Res, BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, feePayments, platformSettings, students, subscriptionInvoices, users } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { PlatformService } from '../platform/platform.service';
import { MailService } from '../notifications/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { payuForm, payuVerify } from '../integrations/payu';

const base = () => (process.env.PUBLIC_API_URL || 'https://admin.nextsoftwares.in') + '/api';
const admin = () => process.env.ADMIN_URL || 'https://admin.nextsoftwares.in';
const html = (ok: boolean, msg: string, back: string) => `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>${ok ? '✅' : '❌'} ${msg}</h2><p><a href="${back}">Back to NextEdge</a></p><script>setTimeout(()=>location.href=${JSON.stringify(back)},2500)</script></body>`;

/** Payment wall: subscription (platform PayU or manual claim) and student fees (centre PayU). */
@Controller('payments')
export class PaymentsController {
  constructor(private dbs: DbService, private platform: PlatformService, private mail: MailService, private notify: NotificationsService) {}

  /** What the owner sees on the wall: open invoice, PayU availability, manual instructions. */
  @Get('wall') @Roles('ADMIN') async wall(@CurrentUser() u: JwtUser) {
    const s = await this.platform.settings(u.centreId!); const p = await this.mail.platform(); const n = await this.platform.activeStudents(u.centreId!);
    const [inv] = await this.dbs.db.select().from(subscriptionInvoices).where(and(eq(subscriptionInvoices.centreId, u.centreId!), eq(subscriptionInvoices.status, 'due')));
    return { status: s.status, paidUntil: s.paidUntil, trialEndsAt: s.trialEndsAt, activeStudents: n, pricePerStudent: Number(s.pricePerStudent), minStudents: s.minStudents, billingCycle: s.billingCycle, invoice: inv || null, payuAvailable: !!(p?.payuKey && p?.payuSalt), manualPayInfo: p?.manualPayInfo || null };
  }

  /** Start PayU checkout for the open subscription invoice (creates one if missing). Returns form fields; the admin panel auto-posts them. */
  @Post('subscription/payu') @Roles('ADMIN') async subPayu(@CurrentUser() u: JwtUser) {
    const p = await this.mail.platform(); if (!p?.payuKey || !p?.payuSalt) throw new BadRequestException('Online payment is not enabled yet. Use the manual option.');
    const inv = await this.platform.raiseInvoice(u.centreId!); const [ce] = await this.dbs.db.select().from(centres).where(eq(centres.id, u.centreId!)); const [me] = await this.dbs.db.select().from(users).where(eq(users.id, u.id));
    return payuForm({ key: p.payuKey, salt: p.payuSalt, test: p.payuTest }, { txnid: `SUB-${inv.id.slice(0, 8)}-${Date.now().toString(36)}`, amount: Number(inv.amount), productinfo: `NextEdge subscription ${ce.name}`.slice(0, 100), firstname: (me?.name || 'Owner').split(' ')[0], email: me?.email || 'owner@example.com', phone: me?.mobile || '9999999999', surl: `${base()}/payments/payu/return`, furl: `${base()}/payments/payu/return`, udf1: 'subscription', udf2: inv.id });
  }

  /** Owner paid by UPI/bank: records the claim; super-admin approves on the Platform page. */
  @Post('subscription/claim') @Roles('ADMIN') async claim(@CurrentUser() u: JwtUser, @Body() b: { reference: string; note?: string }) {
    if (!b.reference?.trim()) throw new BadRequestException('Enter the UTR / transaction reference');
    const inv = await this.platform.raiseInvoice(u.centreId!);
    await this.dbs.db.update(subscriptionInvoices).set({ claimedRef: b.reference.trim(), claimedNote: b.note, claimedAt: new Date() }).where(eq(subscriptionInvoices.id, inv.id));
    const sa = await this.dbs.db.select({ id: users.id }).from(users).where(eq(users.role, 'SUPER_ADMIN')); const [ce] = await this.dbs.db.select().from(centres).where(eq(centres.id, u.centreId!));
    this.notify.notifyUsers(u.centreId!, sa.map((x) => x.id), `Payment claim: ${ce.name}`, `₹${Number(inv.amount).toLocaleString('en-IN')} · ref ${b.reference}. Approve on the Platform page.`, { urgent: true, data: { type: 'subscription' } });
    return { ok: true, invoiceId: inv.id };
  }

  /** Parent pays student fees via the centre's PayU. */
  @Post('fees/payu') async feePayu(@CurrentUser() u: JwtUser, @Body() b: { studentId: string; amount: number }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const s = await this.platform.settings(centreId); if (!s.payuKey || !s.payuSalt) throw new BadRequestException('This centre has not enabled online fee payment yet. Pay at the centre.');
    const mine = await myStudents(this.dbs.db, u, centreId); const st = mine.find((x) => x.id === b.studentId); if (!st) throw new BadRequestException('Not your student');
    const [me] = await this.dbs.db.select().from(users).where(eq(users.id, u.id)); const amount = Number(b.amount); if (!(amount > 0)) throw new BadRequestException('Amount');
    return payuForm({ key: s.payuKey, salt: s.payuSalt, test: s.payuTest }, { txnid: `FEE-${st.id.slice(0, 8)}-${Date.now().toString(36)}`, amount, productinfo: `Fees ${st.name}`.slice(0, 100), firstname: (me?.name || 'Parent').split(' ')[0], email: me?.email || 'parent@example.com', phone: me?.mobile || st.parentMobile, surl: `${base()}/payments/payu/return`, furl: `${base()}/payments/payu/return`, udf1: 'fee', udf2: `${centreId}:${st.id}` });
  }

  /** PayU posts here (success and failure). Verifies the hash, records the payment, shows a small page that returns to the app. */
  @Public() @Post('payu/return') async payuReturn(@Req() req: any, @Res() res: any) {
    const r = req.body || {}; const kind = r.udf1; let cfg: any = null; let back = admin();
    if (kind === 'subscription') { const p = await this.mail.platform(); cfg = p?.payuKey ? { key: p.payuKey, salt: p.payuSalt, test: p.payuTest } : null; back = admin() + '/subscription'; }
    else if (kind === 'fee') { const [centreId] = String(r.udf2 || '').split(':'); const s = centreId ? await this.platform.settings(centreId) : null; cfg = s?.payuKey ? { key: s.payuKey, salt: s.payuSalt, test: s.payuTest } : null; }
    if (!cfg || !payuVerify(cfg, r)) { res.setHeader('Content-Type', 'text/html'); return res.end(html(false, 'Payment could not be verified', back)); }
    if (r.status !== 'success') { res.setHeader('Content-Type', 'text/html'); return res.end(html(false, `Payment ${r.status || 'failed'}`, back)); }
    if (kind === 'subscription') { await this.platform.markPaid(r.udf2, 'payu', r.mihpayid || r.txnid); }
    else { const [centreId, studentId] = String(r.udf2).split(':'); const dup = await this.dbs.db.select({ id: feePayments.id }).from(feePayments).where(eq(feePayments.reference, r.mihpayid || r.txnid));
      if (!dup.length) { const [{ n }] = await this.dbs.db.select({ n: feePayments.id }).from(feePayments).where(eq(feePayments.centreId, centreId)).then((rows) => [{ n: rows.length }]);
        const receiptNo = `R${new Date().getFullYear()}-${String(n + 1).padStart(5, '0')}`; await this.dbs.db.insert(feePayments).values({ centreId, studentId, amount: String(Number(r.amount)), mode: 'UPI', paidOn: new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10), reference: r.mihpayid || r.txnid, receiptNo });
        const [st] = await this.dbs.db.select().from(students).where(eq(students.id, studentId)); const [p] = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT')));
        if (p) this.notify.notifyUsers(centreId, [p.id], `Payment received: ₹${Number(r.amount).toLocaleString('en-IN')}`, `Receipt ${receiptNo} for ${st.name} (online).`, { data: { type: 'fee' } }); } }
    res.setHeader('Content-Type', 'text/html'); res.end(html(true, 'Payment successful', back));
  }

  // ---- super-admin: PayU keys, manual instructions, approve claims ----
  @Get('platform') @Roles('SUPER_ADMIN') async getPlatform() { const p = await this.mail.platform(); const claims = await this.dbs.db.select({ inv: subscriptionInvoices, centreName: centres.name }).from(subscriptionInvoices).innerJoin(centres, eq(centres.id, subscriptionInvoices.centreId)).where(and(eq(subscriptionInvoices.status, 'due'), eq(subscriptionInvoices.claimedRef, subscriptionInvoices.claimedRef))); return { payuKey: p?.payuKey || null, payuTest: p?.payuTest ?? true, manualPayInfo: p?.manualPayInfo || null, claims: claims.filter((c) => c.inv.claimedRef).map((c) => ({ ...c.inv, centreName: c.centreName })) }; }
  @Put('platform') @Roles('SUPER_ADMIN') async setPlatform(@Body() b: { payuKey?: string; payuSalt?: string; payuTest?: boolean; manualPayInfo?: string }) {
    await this.mail.platform(); const set: any = { updatedAt: new Date() }; if (b.payuKey !== undefined) set.payuKey = b.payuKey || null; if (b.payuSalt !== undefined && b.payuSalt) set.payuSalt = b.payuSalt; if (b.payuTest !== undefined) set.payuTest = b.payuTest; if (b.manualPayInfo !== undefined) set.manualPayInfo = b.manualPayInfo;
    await this.dbs.db.update(platformSettings).set(set).where(eq(platformSettings.id, 'platform')); this.mail.invalidate(); return { ok: true };
  }
  @Post('claims/:invoiceId/approve') @Roles('SUPER_ADMIN') approve(@Param('invoiceId') id: string) { return this.platform.markPaid(id, 'manual', undefined); }
  @Post('claims/:invoiceId/reject') @Roles('SUPER_ADMIN') async reject(@Param('invoiceId') id: string, @Body() b: { reason?: string }) { await this.dbs.db.update(subscriptionInvoices).set({ claimedRef: null, claimedAt: null, claimedNote: b.reason || null }).where(eq(subscriptionInvoices.id, id)); return { ok: true }; }

  // ---- owner: centre PayU for fees + white-label app config ----
  @Put('centre') @Roles('ADMIN') async setCentre(@CurrentUser() u: JwtUser, @Body() b: { payuKey?: string; payuSalt?: string; payuTest?: boolean; manualPayInfo?: string }) {
    await this.platform.settings(u.centreId!); const set: any = { updatedAt: new Date() }; if (b.payuKey !== undefined) set.payuKey = b.payuKey || null; if (b.payuSalt) set.payuSalt = b.payuSalt; if (b.payuTest !== undefined) set.payuTest = b.payuTest; if (b.manualPayInfo !== undefined) set.manualPayInfo = b.manualPayInfo;
    await this.dbs.db.update(centreSettings).set(set).where(eq(centreSettings.centreId, u.centreId!)); return { ok: true };
  }
}
