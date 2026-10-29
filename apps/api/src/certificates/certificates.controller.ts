import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, feePayments, records, students } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { PlatformService } from '../platform/platform.service';
import { CERT_TYPES, certificatePdf } from './certificate-pdf';
import { FeesController } from '../fees/fees.controller';

const STAFF = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF'];
/** TC, bonafide, character, study and fee certificates: serial-numbered, registered, printable PDF with letterhead. */
@Controller('certificates')
@Mod('certificates')
export class CertificatesController {
  constructor(private dbs: DbService, private platform: PlatformService, private fees: FeesController) {}

  @Get('types') types() { return Object.entries(CERT_TYPES).map(([key, t]) => ({ key, label: t.label, fields: t.fields })); }

  @Get() @Roles(...STAFF) async list(@CurrentUser() u: JwtUser, @Query('studentId') studentId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const conds: any[] = [eq(records.centreId, centreId), eq(records.kind, 'certificate')]; if (studentId) conds.push(eq(records.studentId, studentId));
    const rows = await this.dbs.db.select({ r: records, name: students.name, rollNo: students.rollNo }).from(records).leftJoin(students, eq(students.id, records.studentId)).where(and(...conds)).orderBy(sql`${records.createdAt} desc`).limit(500);
    return rows.map((x) => ({ ...x.r, data: JSON.parse(x.r.data), studentName: x.name, rollNo: x.rollNo }));
  }

  /** Issue a certificate. For a TC: warns if fees are due (override with force) and can mark the student as left. */
  @Post() @Roles(...STAFF) async issue(@CurrentUser() u: JwtUser, @Body() b: { studentId: string; type: string; data?: Record<string, any>; markLeft?: boolean; force?: boolean; date?: string }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const T = CERT_TYPES[b.type]; if (!T) throw new BadRequestException('Unknown certificate type');
    const [st] = await db.select().from(students).where(and(eq(students.id, b.studentId), eq(students.centreId, centreId))); if (!st) throw new BadRequestException('Student not found');
    const led = (await this.fees.ledger({ ...u, role: 'ADMIN', centreId } as any, centreId)).find((r) => r.studentId === st.id);
    if (b.type === 'transfer' && led && led.balance > 0 && !b.force) throw new BadRequestException(`Fee balance of ₹${led.balance.toLocaleString('en-IN')} is pending. Clear dues, or issue with "force" if the owner allows.`);
    const data: Record<string, any> = { ...(b.data || {}) };
    if (b.type === 'fee' && !data.paid) { const [{ t }] = await db.select({ t: sql<string>`coalesce(sum(${feePayments.amount}), 0)` }).from(feePayments).where(eq(feePayments.studentId, st.id)); data.paid = Number(t); }
    if (b.type === 'transfer') { data.dateOfLeaving = data.dateOfLeaving || new Date().toISOString().slice(0, 10); data.duesCleared = data.duesCleared || (led && led.balance > 0 ? 'No' : 'Yes'); }
    const s = await this.platform.settings(centreId); const session = s.academicSession || String(new Date().getFullYear());
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'certificate'), sql`${records.data}::jsonb->>'type' = ${b.type}`));
    const serial = `${T.prefix}/${session}/${String(Number(n) + 1).padStart(4, '0')}`; const date = b.date || new Date().toISOString().slice(0, 10);
    const [row] = await db.insert(records).values({ centreId, kind: 'certificate', studentId: st.id, title: T.label, date, status: 'issued', data: JSON.stringify({ ...data, type: b.type, serial, purpose: data.purpose || data.reason || '' }), parentVisible: true, createdBy: u.id }).returning();
    if (b.type === 'transfer' && b.markLeft !== false) await db.update(students).set({ active: false, leftOn: data.dateOfLeaving, leftReason: data.reason || 'Transfer' }).where(eq(students.id, st.id));
    return { id: row.id, serial };
  }

  @Post(':id/cancel') @Roles('SUPER_ADMIN', 'ADMIN') async cancel(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) { await this.dbs.db.update(records).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(records.id, id), eq(records.centreId, centreOf(u, c)), eq(records.kind, 'certificate'))); return { ok: true }; }

  @Get(':id.pdf') async pdf(@CurrentUser() u: JwtUser, @Param('id') id: string, @Res() res: any, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [r] = await db.select().from(records).where(and(eq(records.id, id), eq(records.centreId, centreId), eq(records.kind, 'certificate'))); if (!r) throw new NotFoundException();
    if (!STAFF.includes(u.role)) { const mine = await myStudents(db, u, centreId); if (!mine.some((s) => s.id === r.studentId)) throw new ForbiddenException(); }
    const [st] = await db.select().from(students).where(eq(students.id, r.studentId!)); const [b] = st.batchId ? await db.select().from(batches).where(eq(batches.id, st.batchId)) : []; const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const s = await this.platform.settings(centreId); const d = JSON.parse(r.data);
    const pdf = await certificatePdf({ name: ce.name, address: s.address || ce.city, board: s.board, affiliationNo: s.affiliationNo, udise: s.udiseCode, phone: s.phone, principal: s.principalName, website: s.website }, d.type, { name: st.name, father: st.fatherName || st.parentName, mother: st.motherName, dob: st.dob, className: b?.className || st.className, section: b?.section, admissionNo: st.admissionNo, admissionDate: st.admissionDate, rollNo: st.rollNo, category: st.category, gender: st.gender, address: st.address }, d, d.serial, r.date || new Date().toISOString().slice(0, 10), r.status === 'cancelled');
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${String(d.serial).replace(/\//g, '-')}.pdf"`); res.end(pdf);
  }
}
