import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Req, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import { receiptPdf } from './receipt';
import { batches, centres, records } from '../db/schema';
import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { feePayments, feePlans, studentFeePlans, students, users } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { NotificationsService } from '../notifications/notifications.service';
import { createPaymentLink, razorpayReady, verifyWebhook } from '../integrations/razorpay';
import { PlatformService } from '../platform/platform.service';

class PlanDto { @IsString() name: string; @IsNumberString() amount: string; @IsIn(['one-time', 'monthly', 'quarterly']) cycle: string; @IsOptional() @IsString() batchId?: string; }
class AssignDto { @IsString() studentId: string; @IsString() planId: string; @IsString() startDate: string; @IsOptional() @IsNumberString() discount?: string; }
class PaymentDto { @IsString() studentId: string; @IsNumberString() amount: string; @IsIn(['UPI', 'CASH', 'CARD', 'NETBANKING', 'CHEQUE']) mode: any; @IsString() paidOn: string; @IsOptional() @IsString() reference?: string; }

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
/** Instalments due so far for a plan started on startDate. */
function dueSoFar(cycle: string, amount: number, discount: number, startDate: string): number {
  const [y, m] = startDate.split('-').map(Number); const [ty, tm, td] = today().split('-').map(Number);
  if (startDate > today()) return 0;
  const months = (ty - y) * 12 + (tm - m) + (td >= Number(startDate.slice(8)) || tm !== m || ty !== y ? 1 : 1);
  const n = cycle === 'one-time' ? 1 : cycle === 'quarterly' ? Math.ceil(months / 3) : months;
  return Math.max(0, n * (amount - discount));
}

/** Date of the next instalment after today. */
function nextDue(cycle: string, startDate: string): string | null {
  if (cycle === 'one-time') return startDate > today() ? startDate : null;
  const step = cycle === 'quarterly' ? 3 : 1; const d = new Date(startDate + 'T00:00:00Z'); const t = today();
  for (let i = 0; i < 120; i++) { const iso = d.toISOString().slice(0, 10); if (iso > t) return iso; d.setUTCMonth(d.getUTCMonth() + step); }
  return null;
}

@Controller('fees')
@Mod('fees')
export class FeesController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService) {}

  @Get('plans') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async plans(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const rows = await this.dbs.db.select().from(feePlans).where(eq(feePlans.centreId, centreOf(u, c)));
    const counts = rows.length ? await this.dbs.db.select({ planId: studentFeePlans.planId, n: sql<number>`count(*)` }).from(studentFeePlans).where(inArray(studentFeePlans.planId, rows.map((r) => r.id))).groupBy(studentFeePlans.planId) : [];
    return rows.map((r) => ({ ...r, students: Number(counts.find((x) => x.planId === r.id)?.n || 0) }));
  }
  @Post('plans') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async createPlan(@CurrentUser() u: JwtUser, @Body() dto: PlanDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(feePlans).values({ ...dto, centreId: centreOf(u, c) }).returning(); return row;
  }
  /** Assign a plan to a student (replaces any existing assignment). */
  @Put('plans/:id') @Roles('SUPER_ADMIN', 'ADMIN') async updatePlan(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: Partial<PlanDto>, @Query('centreId') c?: string) {
    const set: any = {}; if (dto.name) set.name = dto.name; if (dto.amount) set.amount = dto.amount; if (dto.cycle) set.cycle = dto.cycle; if (dto.batchId !== undefined) set.batchId = dto.batchId || null;
    const [row] = await this.dbs.db.update(feePlans).set(set).where(and(eq(feePlans.id, id), eq(feePlans.centreId, centreOf(u, c)))).returning(); if (!row) throw new NotFoundException(); return row;
  }
  @Delete('plans/:id') @Roles('SUPER_ADMIN', 'ADMIN') async deletePlan(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const used = await this.dbs.db.select({ id: studentFeePlans.id }).from(studentFeePlans).where(eq(studentFeePlans.planId, id)); if (used.length) throw new BadRequestException(`${used.length} students are on this plan. Move them first.`);
    await this.dbs.db.delete(feePlans).where(and(eq(feePlans.id, id), eq(feePlans.centreId, centreOf(u, c)))); return { ok: true };
  }
  /** Put every active student of a batch on a plan (skips students who already have one unless replace=true). */
  @Post('assign-batch') @Roles('SUPER_ADMIN', 'ADMIN') async assignBatch(@CurrentUser() u: JwtUser, @Body() b: { batchId: string; planId: string; startDate: string; replace?: boolean }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const sts = await db.select({ id: students.id }).from(students).where(and(eq(students.centreId, centreId), eq(students.batchId, b.batchId), eq(students.active, true)));
    let n = 0; for (const s of sts) { const [ex] = await db.select().from(studentFeePlans).where(eq(studentFeePlans.studentId, s.id)); if (ex && !b.replace) continue; await db.delete(studentFeePlans).where(eq(studentFeePlans.studentId, s.id)); await db.insert(studentFeePlans).values({ centreId, studentId: s.id, planId: b.planId, startDate: b.startDate }); n++; }
    return { assigned: n, total: sts.length };
  }
  @Delete('assign/:studentId') @Roles('SUPER_ADMIN', 'ADMIN') async unassign(@CurrentUser() u: JwtUser, @Param('studentId') studentId: string, @Query('centreId') c?: string) { await this.dbs.db.delete(studentFeePlans).where(and(eq(studentFeePlans.studentId, studentId), eq(studentFeePlans.centreId, centreOf(u, c)))); return { ok: true }; }

  /** Late fine: adds a fine record to every student with a balance (or the given ids). Skips students already fined this month. Flat amount, or perDay × days late (days = since the 10th unless given). */
  @Post('apply-fine') @Roles('SUPER_ADMIN', 'ADMIN') async applyFine(@CurrentUser() u: JwtUser, @Body() b: { amount?: number; perDay?: number; days?: number; studentIds?: string[]; reason?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const rows = (await this.ledger(u, c)).filter((r) => r.balance > 0 && (!b.studentIds?.length || b.studentIds.includes(r.studentId))); const month = today().slice(0, 7); const dayOfMonth = Number(today().slice(8)); let n = 0, total = 0;
    const amt = b.perDay ? Number(b.perDay) * Math.max(1, b.days ?? Math.max(1, dayOfMonth - 10)) : Number(b.amount || 0); if (!(amt > 0)) throw new BadRequestException('Enter a fine amount (or per-day rate)');
    for (const r of rows) {
      const ex = await db.select({ id: records.id }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'fee-fine'), eq(records.studentId, r.studentId), eq(records.status, 'applied'), sql`to_char(${records.date}, 'YYYY-MM') = ${month}`)); if (ex.length) continue;
      await db.insert(records).values({ centreId, kind: 'fee-fine', studentId: r.studentId, title: b.reason || 'Late fee fine', date: today(), status: 'applied', data: JSON.stringify({ amount: amt, note: `Balance ₹${r.balance} overdue` }), parentVisible: true, createdBy: u.id }); n++; total += amt;
      const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, r.parentMobile), eq(users.role, 'PARENT'))); if (p) this.notify.notifyUsers(centreId, [p.id], `Late fee fine ₹${amt}`, `A late fee fine of ₹${amt} has been added for ${r.name}. Pay the balance to avoid more.`, { data: { type: 'fee', studentId: r.studentId } });
    }
    return { fined: n, amountEach: amt, total };
  }

  /** Remind one parent. */
  @Post('remind/:studentId') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async remindOne(@CurrentUser() u: JwtUser, @Param('studentId') studentId: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const r = (await this.ledger(u, c)).find((x) => x.studentId === studentId); if (!r || r.balance <= 0) return { reminded: 0 };
    const [p] = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, r.parentMobile), eq(users.role, 'PARENT')));
    if (p) this.notify.notifyUsers(centreId, [p.id], `Fee due: ₹${r.balance.toLocaleString('en-IN')}`, `${r.name}'s fee balance is ₹${r.balance.toLocaleString('en-IN')}. Please pay at the centre or through the app.`, { data: { type: 'fee', studentId } });
    return { reminded: p ? 1 : 0 };
  }

  /** Collection report for a date range: totals by mode, by day, by batch; outstanding by batch. */
  @Get('report') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async report(@CurrentUser() u: JwtUser, @Query('from') from?: string, @Query('to') to?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const f = from || today().slice(0, 7) + '-01', t = to || today();
    const rows = await db.select({ amount: feePayments.amount, mode: feePayments.mode, paidOn: feePayments.paidOn, batchId: students.batchId }).from(feePayments).innerJoin(students, eq(students.id, feePayments.studentId)).where(and(eq(feePayments.centreId, centreId), sql`${feePayments.paidOn} between ${f} and ${t}`));
    const byMode: Record<string, number> = {}, byDay: Record<string, number> = {}, byBatch: Record<string, number> = {}; let total = 0;
    rows.forEach((r) => { const a = Number(r.amount); total += a; byMode[r.mode] = (byMode[r.mode] || 0) + a; byDay[r.paidOn] = (byDay[r.paidOn] || 0) + a; byBatch[r.batchId || 'none'] = (byBatch[r.batchId || 'none'] || 0) + a; });
    const led = await this.ledger(u, c); const outstandingByBatch: Record<string, number> = {}; led.forEach((r) => { outstandingByBatch[r.batchId || 'none'] = (outstandingByBatch[r.batchId || 'none'] || 0) + r.balance; });
    const bs = await db.select({ id: batches.id, name: batches.name }).from(batches).where(eq(batches.centreId, centreId)); const name = (id: string) => bs.find((b) => b.id === id)?.name || 'No batch';
    return { from: f, to: t, total, count: rows.length, byMode, byDay, byBatch: Object.entries(byBatch).map(([id, v]) => ({ batch: name(id), collected: v, outstanding: outstandingByBatch[id] || 0 })).concat(Object.entries(outstandingByBatch).filter(([id]) => !byBatch[id]).map(([id, v]) => ({ batch: name(id), collected: 0, outstanding: v }))), defaulters: led.filter((r) => r.balance > 0).length, noPlan: led.filter((r) => !r.plan).length };
  }

  /** Void a wrongly entered payment (owner only). */
  @Delete('payments/:id') @Roles('SUPER_ADMIN', 'ADMIN') async voidPayment(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const [p] = await this.dbs.db.delete(feePayments).where(and(eq(feePayments.id, id), eq(feePayments.centreId, centreOf(u, c)))).returning(); if (!p) throw new NotFoundException(); return { ok: true };
  }

  @Post('assign') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async assign(@CurrentUser() u: JwtUser, @Body() dto: AssignDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    await this.dbs.db.delete(studentFeePlans).where(and(eq(studentFeePlans.centreId, centreId), eq(studentFeePlans.studentId, dto.studentId)));
    const [row] = await this.dbs.db.insert(studentFeePlans).values({ centreId, studentId: dto.studentId, planId: dto.planId, startDate: dto.startDate, discount: dto.discount || '0' }).returning(); return row;
  }

  /** Ledger: every student with plan, due so far, paid, balance. Parents/students see only their own. */
  @Get('ledger') async ledger(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    let where: any = and(eq(students.centreId, centreId), eq(students.active, true));
    if (u.role === 'STUDENT') where = and(where, eq(students.userId, u.id));
    if (u.role === 'PARENT') { const [me] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, u.id)); where = and(where, eq(students.parentMobile, me?.mobile || '')); }
    const sts = await db.select().from(students).where(where);
    if (!sts.length) return [];
    const ids = sts.map((s) => s.id);
    const assigns = await db.select({ studentId: studentFeePlans.studentId, startDate: studentFeePlans.startDate, discount: studentFeePlans.discount, planName: feePlans.name, amount: feePlans.amount, cycle: feePlans.cycle })
      .from(studentFeePlans).innerJoin(feePlans, eq(feePlans.id, studentFeePlans.planId)).where(inArray(studentFeePlans.studentId, ids));
    const paid = await db.select({ studentId: feePayments.studentId, total: sql<string>`sum(${feePayments.amount})` }).from(feePayments).where(inArray(feePayments.studentId, ids)).groupBy(feePayments.studentId);
    const last = await db.select({ studentId: feePayments.studentId, on: sql<string>`max(${feePayments.paidOn})` }).from(feePayments).where(inArray(feePayments.studentId, ids)).groupBy(feePayments.studentId);
    const lm = new Map(last.map((l) => [l.studentId, l.on]));
    const fineRows = await db.select({ studentId: records.studentId, data: records.data }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'fee-fine'), eq(records.status, 'applied'), inArray(records.studentId, ids))); const fm = new Map<string, number>(); fineRows.forEach((f) => fm.set(f.studentId!, (fm.get(f.studentId!) || 0) + Number(JSON.parse(f.data).amount || 0)));
    const pm = new Map(paid.map((p) => [p.studentId, Number(p.total)])); const am = new Map(assigns.map((a) => [a.studentId, a]));
    return sts.map((s) => { const a = am.get(s.id); const fine = fm.get(s.id) || 0; const due = (a ? dueSoFar(a.cycle, Number(a.amount), Number(a.discount), a.startDate) : 0) + fine; const paidAmt = pm.get(s.id) || 0;
      return { studentId: s.id, name: s.name, rollNo: s.rollNo, batchId: s.batchId, parentMobile: s.parentMobile, plan: a ? { name: a.planName, amount: Number(a.amount), cycle: a.cycle, startDate: a.startDate, discount: Number(a.discount) } : null, due, paid: paidAmt, balance: due - paidAmt }; });
  }

  @Get('defaulters') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async defaulters(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return (await this.ledger(u, c)).filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
  }

  /** Send a reminder to every parent with a balance (push → WhatsApp). Admin triggers it or a daily cron hits this. */
  @Post('remind') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async remind(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const rows = await this.defaulters(u, c); let n = 0;
    for (const r of rows) {
      const [p] = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, r.parentMobile), eq(users.role, 'PARENT')));
      if (p) { this.notify.notifyUsers(centreId, [p.id], `Fee due: ₹${r.balance.toLocaleString('en-IN')}`, `${r.name}'s fee balance is ₹${r.balance.toLocaleString('en-IN')}. Please pay at the centre or through the app.`, { waTemplate: process.env.WA_TEMPLATE_FEE || 'cc_fee_due' }); n++; }
    }
    return { reminded: n };
  }

  @Get('payments') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') payments(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select({ id: feePayments.id, studentId: feePayments.studentId, studentName: students.name, amount: feePayments.amount, mode: feePayments.mode, paidOn: feePayments.paidOn, receiptNo: feePayments.receiptNo, reference: feePayments.reference })
      .from(feePayments).innerJoin(students, eq(students.id, feePayments.studentId)).where(eq(feePayments.centreId, centreOf(u, c))).orderBy(desc(feePayments.paidOn)).limit(300);
  }
  /** Receipts for one student (parent/student app). */
  @Get('receipts') async receipts(@CurrentUser() u: JwtUser, @Query('studentId') studentId: string, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(feePayments).where(and(eq(feePayments.centreId, centreOf(u, c)), eq(feePayments.studentId, studentId))).orderBy(desc(feePayments.paidOn));
  }

  @Post('payments') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async record(@CurrentUser() u: JwtUser, @Body() dto: PaymentDto, @Query('centreId') c?: string) {
    return this.insertPayment(centreOf(u, c), dto.studentId, Number(dto.amount), dto.mode, dto.paidOn, dto.reference, u.id);
  }

  /** Parent taps "Pay now": returns a Razorpay payment link for the current balance. */
  @Post('pay-link') async payLink(@CurrentUser() u: JwtUser, @Body() body: { studentId: string }, @Query('centreId') c?: string) {
    if (!razorpayReady()) return { error: 'Online payment is not enabled yet. Pay at the centre.' };
    const centreId = centreOf(u, c); const rows = await this.ledger(u, c); const r = rows.find((x) => x.studentId === body.studentId);
    if (!r || r.balance <= 0) return { error: 'Nothing due' };
    const link = await createPaymentLink(r.balance, `Fees for ${r.name}`, { name: r.name, contact: r.parentMobile }, `${r.studentId}-${Date.now()}`, { centreId, studentId: r.studentId });
    return { url: link.short_url, amount: r.balance };
  }

  /** Razorpay webhook (payment_link.paid). Configure the webhook URL as https://<api>/api/fees/webhook/razorpay. */
  @Public() @Post('webhook/razorpay') async webhook(@Req() req: any, @Headers('x-razorpay-signature') sig: string) {
    const raw = req.rawBody?.toString() || JSON.stringify(req.body);
    if (!verifyWebhook(raw, sig || '')) return { ok: false };
    const ev = req.body; if (ev.event !== 'payment_link.paid') return { ok: true, ignored: ev.event };
    const pay = ev.payload?.payment?.entity; const notes = ev.payload?.payment_link?.entity?.notes || {};
    if (pay && notes.subscriptionInvoiceId) { await this.platform.markPaid(notes.subscriptionInvoiceId, 'razorpay', pay.id); return { ok: true }; }
    if (!pay || !notes.centreId || !notes.studentId) return { ok: false };
    const dup = await this.dbs.db.select({ id: feePayments.id }).from(feePayments).where(eq(feePayments.reference, pay.id));
    if (dup.length) return { ok: true, duplicate: true };
    await this.insertPayment(notes.centreId, notes.studentId, pay.amount / 100, 'UPI', today(), pay.id, null);
    return { ok: true };
  }

  /** PDF receipt (admin, or the parent/student it belongs to). */
  @Get('receipt/:id.pdf') async receipt(@CurrentUser() u: JwtUser, @Param('id') id: string, @Res() res: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [p] = await db.select().from(feePayments).where(and(eq(feePayments.id, id), eq(feePayments.centreId, centreId))); if (!p) throw new NotFoundException();
    const [st] = await db.select().from(students).where(eq(students.id, p.studentId)); const [ce] = await db.select().from(centres).where(eq(centres.id, centreId));
    const batch = st.batchId ? (await db.select().from(batches).where(eq(batches.id, st.batchId)))[0]?.name : undefined;
    if (!['SUPER_ADMIN', 'ADMIN'].includes(u.role)) { const ok = (await this.ledger(u, c)).some((r) => r.studentId === st.id); if (!ok) throw new NotFoundException(); }
    const bal = (await this.ledger({ ...u, role: 'ADMIN', centreId } as any, centreId)).find((r) => r.studentId === st.id)?.balance ?? 0;
    const pdf = await receiptPdf({ centre: ce.name, city: ce.city, receiptNo: p.receiptNo || '', student: st.name, rollNo: st.rollNo, batch, parent: st.parentName, amount: Number(p.amount), mode: p.mode, paidOn: p.paidOn, reference: p.reference, balance: bal });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${p.receiptNo}.pdf"`); res.end(pdf);
  }

  @Get('summary') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async summary(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [m] = await this.dbs.db.select({ month: sql<string>`coalesce(sum(${feePayments.amount}) filter (where date_trunc('month', ${feePayments.paidOn}) = date_trunc('month', current_date)), 0)`, total: sql<string>`coalesce(sum(${feePayments.amount}), 0)` }).from(feePayments).where(eq(feePayments.centreId, centreId));
    const outstanding = (await this.defaulters(u, c)).reduce((a, r) => a + r.balance, 0);
    return { collectedThisMonth: Number(m.month), collectedTotal: Number(m.total), outstanding };
  }

  private async insertPayment(centreId: string, studentId: string, amount: number, mode: any, paidOn: string, reference: string | undefined, by: string | null) {
    const db = this.dbs.db;
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(feePayments).where(eq(feePayments.centreId, centreId));
    const receiptNo = `R${today().slice(0, 4)}-${String(Number(n) + 1).padStart(5, '0')}`;
    const [row] = await db.insert(feePayments).values({ centreId, studentId, amount: String(amount), mode, paidOn, reference, receiptNo, recordedBy: by }).returning();
    const [st] = await db.select({ name: students.name, parentMobile: students.parentMobile }).from(students).where(eq(students.id, studentId));
    if (st) { const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT')));
      if (p) this.notify.notifyUsers(centreId, [p.id], `Payment received: ₹${amount.toLocaleString('en-IN')}`, `Receipt ${receiptNo} for ${st.name} (${mode}).`, { waTemplate: process.env.WA_TEMPLATE_RECEIPT || 'cc_receipt' }); }
    return row;
  }
}
