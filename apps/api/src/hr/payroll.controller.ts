import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { and, eq, gte, lte } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { DbService } from '../db/db.service';
import { centres, records, staffAttendance, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformService } from '../platform/platform.service';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const label = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
/** Payroll: salary structure (Employees) × staff attendance + approved leave → payslips, PDF, mark paid. */
@Controller('payroll')
@Mod('hr')
export class PayrollController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService) {}

  /** Generate / refresh draft payslips for a month (YYYY-MM). Paid payslips are never overwritten. */
  @Post('generate') @Roles('SUPER_ADMIN', 'ADMIN') async generate(@CurrentUser() u: JwtUser, @Body() b: { month: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const month = b.month || new Date().toISOString().slice(0, 7); if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Month must be YYYY-MM');
    const [y, m] = month.split('-').map(Number); const dim = new Date(y, m, 0).getDate(); const from = `${month}-01`, to = `${month}-${String(dim).padStart(2, '0')}`;
    const hol = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'holiday'), eq(records.status, 'holiday'))); const holidays = new Set<string>();
    hol.forEach((h) => { if (!h.date) return; const end = JSON.parse(h.data).endDate || h.date; for (let d = new Date(h.date + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) holidays.add(d.toISOString().slice(0, 10)); });
    let working = 0; for (let d = 1; d <= dim; d++) { const iso = `${month}-${String(d).padStart(2, '0')}`; if (new Date(iso + 'T00:00:00Z').getUTCDay() !== 0 && !holidays.has(iso)) working++; }
    const emps = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'employee'), eq(records.status, 'active')));
    const leaves = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'staff-leave'), eq(records.status, 'approved')));
    const out = { created: 0, updated: 0, skippedPaid: 0, noSalary: [] as string[], workingDays: working };
    for (const e of emps) {
      if (!e.staffId) continue; const d = JSON.parse(e.data); const gross0 = Number(d.basic || 0) + Number(d.hra || 0) + Number(d.allowances || 0); if (!gross0) { out.noSalary.push(e.title); continue; }
      const att = await db.select().from(staffAttendance).where(and(eq(staffAttendance.userId, e.staffId), gte(staffAttendance.date, from), lte(staffAttendance.date, to)));
      const presentDates = new Set<string>(); let present = 0; att.forEach((a) => { if (a.status === 'absent') return; if (a.status === 'leave') return; present += a.status === 'half-day' ? 0.5 : 1; if (a.status !== 'half-day') presentDates.add(a.date); });
      let paidLeave = 0; leaves.filter((l) => l.staffId === e.staffId && JSON.parse(l.data).type !== 'Unpaid').forEach((l) => { const ld = JSON.parse(l.data); const end = ld.toDate || l.date; if (!l.date) return; for (let dd = new Date(l.date + 'T00:00:00Z'); dd.toISOString().slice(0, 10) <= end; dd.setUTCDate(dd.getUTCDate() + 1)) { const iso = dd.toISOString().slice(0, 10); if (iso >= from && iso <= to && dd.getUTCDay() !== 0 && !holidays.has(iso) && !presentDates.has(iso)) paidLeave++; } });
      const noAtt = att.length === 0 && paidLeave === 0; const payDays = noAtt ? working : Math.min(working, present + paidLeave);
      const gross = Math.round(gross0 * (payDays / working)); const ded = Number(d.deductions || 0); const net = Math.max(0, gross - ded);
      const [ex] = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'payslip'), eq(records.staffId, e.staffId), eq(records.date, to)));
      const data = { month, workingDays: working, presentDays: noAtt ? working : present, paidLeave, basic: Number(d.basic || 0), grossFull: gross0, gross, deductions: ded, advance: 0, net, note: noAtt ? 'No attendance marked — full month assumed. Edit before paying.' : '' };
      if (ex) { if (ex.status === 'paid') { out.skippedPaid++; continue; } await db.update(records).set({ data: JSON.stringify({ ...JSON.parse(ex.data), ...data }), updatedAt: new Date() }).where(eq(records.id, ex.id)); out.updated++; }
      else { await db.insert(records).values({ centreId, kind: 'payslip', staffId: e.staffId, title: label(month), date: to, status: 'draft', data: JSON.stringify(data), createdBy: u.id }); out.created++; }
    }
    return out;
  }

  @Get('summary') @Roles('SUPER_ADMIN', 'ADMIN') async summary(@CurrentUser() u: JwtUser, @Query('month') month?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const m = month || new Date().toISOString().slice(0, 7); const rows = await this.dbs.db.select({ r: records, name: users.name }).from(records).leftJoin(users, eq(users.id, records.staffId)).where(and(eq(records.centreId, centreId), eq(records.kind, 'payslip'), eq(records.title, label(m))));
    const slips = rows.map((x) => ({ ...x.r, data: JSON.parse(x.r.data), staffName: x.name })); const sum = (f: (s: any) => number) => slips.reduce((a, s) => a + f(s), 0);
    return { month: m, count: slips.length, gross: sum((s) => Number(s.data.gross || 0)), deductions: sum((s) => Number(s.data.deductions || 0)), net: sum((s) => Number(s.data.net || 0)), paid: sum((s) => (s.status === 'paid' ? Number(s.data.net || 0) : 0)), draft: slips.filter((s) => s.status === 'draft').length, slips };
  }

  @Post(':id/pay') @Roles('SUPER_ADMIN', 'ADMIN') async pay(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: { mode?: string; paidOn?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const [r] = await this.dbs.db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'payslip'))); if (!r) throw new NotFoundException();
    const d = JSON.parse(r.data); await this.dbs.db.update(records).set({ status: 'paid', parentVisible: false, data: JSON.stringify({ ...d, paidOn: b.paidOn || new Date().toISOString().slice(0, 10), mode: b.mode || 'Bank transfer' }), updatedAt: new Date() }).where(eq(records.id, id));
    if (r.staffId) this.notify.notifyUsers(centreId, [r.staffId], `Salary credited — ${r.title}`, `Net pay ₹${Number(d.net).toLocaleString('en-IN')}. Payslip is in the app.`, { data: { type: 'payslip', id } }); return { ok: true };
  }

  /** Staff: own payslips (paid ones). */
  @Get('mine') async mine(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const rows = await this.dbs.db.select().from(records).where(and(eq(records.centreId, centreOf(u, c)), eq(records.kind, 'payslip'), eq(records.staffId, u.id), eq(records.status, 'paid'))); return rows.map((r) => ({ ...r, data: JSON.parse(r.data) })); }

  @Get(':id.pdf') async pdf(@CurrentUser() u: JwtUser, @Param('id') id: string, @Res() res: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [r] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'payslip'))); if (!r) throw new NotFoundException();
    if (!['SUPER_ADMIN', 'ADMIN'].includes(u.role) && r.staffId !== u.id) throw new ForbiddenException();
    const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const s = await this.platform.settings(centreId); const [emp] = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'employee'), eq(records.staffId, r.staffId!))); const e = emp ? JSON.parse(emp.data) : {}; const d = JSON.parse(r.data); const [st] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.staffId!));
    const doc = new PDFDocument({ size: 'A4', margin: 40 }); const chunks: Buffer[] = []; doc.on('data', (x) => chunks.push(x)); const done = new Promise<Buffer>((rs) => doc.on('end', () => rs(Buffer.concat(chunks))));
    const W = doc.page.width - 80; const navy = '#10243A', grey = '#666666';
    doc.rect(40, 36, W, 56).lineWidth(1).stroke(navy); doc.fillColor(navy).font('Helvetica-Bold').fontSize(16).text(ce.name, 40, 46, { width: W, align: 'center' }); doc.font('Helvetica').fontSize(8.5).fillColor(grey).text(s.address || ce.city || '', { width: W, align: 'center' });
    doc.fillColor('#1673D9').font('Helvetica-Bold').fontSize(13).text(`PAYSLIP — ${r.title}`, 40, 106, { width: W, align: 'center' });
    let y = 136; const kv = (x: number, yy: number, k: string, v: string) => { doc.fillColor(grey).font('Helvetica').fontSize(9.5).text(k, x, yy, { width: 100 }); doc.fillColor(navy).font('Helvetica-Bold').text(v || '—', x + 104, yy, { width: 160 }); };
    kv(40, y, 'Employee', st?.name || ''); kv(300, y, 'Designation', e.designation || ''); kv(40, y + 16, 'Department', e.department || ''); kv(300, y + 16, 'Date of joining', e.doj || ''); kv(40, y + 32, 'Working days', String(d.workingDays ?? '')); kv(300, y + 32, 'Days paid', String((Number(d.presentDays || 0) + Number(d.paidLeave || 0))));
    y += 64; const box = (title: string, rows: [string, number][], x: number, w: number) => { doc.rect(x, y, w, 20).fill(navy); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text(title, x + 8, y + 5); let yy = y + 20; rows.forEach(([k, v], i) => { doc.rect(x, yy, w, 22).fillAndStroke(i % 2 ? '#F4F7FB' : '#fff', '#dddddd'); doc.fillColor(navy).font('Helvetica').fontSize(10).text(k, x + 8, yy + 6); doc.font('Helvetica-Bold').text(`Rs ${v.toLocaleString('en-IN')}`, x + w - 100, yy + 6, { width: 92, align: 'right' }); yy += 22; }); return yy; };
    const half = (W - 12) / 2; const e1 = box('Earnings', [['Basic', Number(e.basic || d.basic || 0)], ['HRA / allowances', Number(e.hra || 0) + Number(e.allowances || 0)], ['Less: unpaid days', Number(d.gross || 0) - Number(d.grossFull || d.gross || 0)]], 40, half); const e2 = box('Deductions', [['Fixed deductions', Number(d.deductions || 0)], ['Advance recovered', Number(d.advance || 0)]], 40 + half + 12, half);
    y = Math.max(e1, e2) + 14; doc.rect(40, y, W, 30).fill('#EAF2FC'); doc.fillColor(navy).font('Helvetica-Bold').fontSize(13).text('NET PAY', 52, y + 8).text(`Rs ${Number(d.net || 0).toLocaleString('en-IN')}`, 40, y + 8, { width: W - 12, align: 'right' });
    y += 44; doc.font('Helvetica').fontSize(9.5).fillColor(grey).text(r.status === 'paid' ? `Paid on ${d.paidOn || ''} by ${d.mode || ''}` : 'Status: draft — not yet paid', 40, y); if (d.note) doc.text(d.note, 40, y + 14, { width: W });
    doc.fontSize(8).text('Computer-generated payslip. Issued via NextEdge.', 40, 790, { width: W, align: 'center' }); doc.end(); const pdf = await done;
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="payslip-${r.title.replace(/\s/g, '-')}.pdf"`); res.end(pdf);
  }
}
