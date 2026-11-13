import { Controller, Get, Query, Res } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, centreSettings, centres, enquiries, examMarks, exams, feePayments, records, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { PlatformService } from '../platform/platform.service';

const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** Charts for the owner and government-style exports (UDISE+ style enrolment, student and staff sheets). */
@Controller('insights')
@Mod('reports')
@Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
export class InsightsController {
  constructor(private dbs: DbService, private platform: PlatformService) {}

  @Get('overview') async overview(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const now = new Date(Date.now() + 5.5 * 3600e3); const months: string[] = []; for (let i = 5; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
    const pay = await db.select({ amount: feePayments.amount, paidOn: feePayments.paidOn }).from(feePayments).where(and(eq(feePayments.centreId, centreId), gte(feePayments.paidOn, months[0] + '-01')));
    const collection = months.map((m) => ({ label: m, value: pay.filter((p) => p.paidOn.startsWith(m)).reduce((a, p) => a + Number(p.amount), 0) }));
    const bs = await db.select().from(batches).where(eq(batches.centreId, centreId)).orderBy(batches.sortOrder, batches.name); const sts = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true)));
    const strength = bs.map((b) => ({ label: b.name, value: sts.filter((s) => s.batchId === b.id).length, capacity: b.capacity || 0, boys: sts.filter((s) => s.batchId === b.id && s.gender === 'Male').length, girls: sts.filter((s) => s.batchId === b.id && s.gender === 'Female').length }));
    const att = await db.select({ batchId: attendance.batchId, status: attendance.status, n: sql<number>`count(*)` }).from(attendance).where(and(eq(attendance.centreId, centreId), gte(attendance.date, months[5] + '-01'))).groupBy(attendance.batchId, attendance.status);
    const attendancePct = bs.map((b) => { const m = att.filter((a) => a.batchId === b.id && a.status !== 'LEAVE'); const tot = m.reduce((a, x) => a + Number(x.n), 0); const pr = m.filter((x) => x.status === 'PRESENT' || x.status === 'LATE').reduce((a, x) => a + Number(x.n), 0); return { label: b.name, value: tot ? Math.round((pr / tot) * 100) : 0 }; });
    const ex = await db.select().from(exams).where(eq(exams.centreId, centreId)).orderBy(sql`${exams.date} desc nulls last`).limit(60); const marks = ex.length ? await db.select().from(examMarks).where(inArray(examMarks.examId, ex.map((e) => e.id))) : [];
    const examAvg = bs.map((b) => { const e = ex.find((x) => x.batchId === b.id); if (!e) return { label: b.name, value: 0, exam: '' }; const subj: { max: number }[] = JSON.parse(e.subjects); const mx = Object.fromEntries(subj.map((s: any) => [s.name, s.max])); const ms = marks.filter((m) => m.examId === e.id && !m.absent && m.marks !== null); const pct = ms.length ? ms.reduce((a, m) => a + (Number(m.marks) / (mx[m.subject] || 100)) * 100, 0) / ms.length : 0; return { label: b.name, value: Math.round(pct), exam: e.name }; }).filter((x) => x.value > 0);
    const enq = await db.select({ status: enquiries.status, n: sql<number>`count(*)` }).from(enquiries).where(eq(enquiries.centreId, centreId)).groupBy(enquiries.status);
    const recs = await db.select({ kind: records.kind, status: records.status, date: records.date }).from(records).where(and(eq(records.centreId, centreId), inArray(records.kind, ['discipline', 'health', 'visitor', 'loan'])));
    const disc = months.map((m) => ({ label: m, value: recs.filter((r) => r.kind === 'discipline' && r.date?.startsWith(m)).length }));
    const gender = { Male: sts.filter((s) => s.gender === 'Male').length, Female: sts.filter((s) => s.gender === 'Female').length, Other: sts.filter((s) => s.gender && !['Male', 'Female'].includes(s.gender)).length, Unknown: sts.filter((s) => !s.gender).length };
    const category: Record<string, number> = {}; sts.forEach((s) => { const k = s.category || 'Not set'; category[k] = (category[k] || 0) + 1; });
    return { totals: { students: sts.length, batches: bs.length, collectedThisMonth: collection[5].value, loansOut: recs.filter((r) => r.kind === 'loan' && r.status === 'issued').length, visitorsToday: recs.filter((r) => r.kind === 'visitor' && r.date === now.toISOString().slice(0, 10)).length }, collection, strength, attendancePct, examAvg, enquiries: enq.map((e) => ({ label: e.status, value: Number(e.n) })), discipline: disc, gender, category };
  }

  /** UDISE+ style exports. type = students | staff | enrolment */
  @Get('udise.csv') @Roles('SUPER_ADMIN', 'ADMIN') /* data export: owner only, never staff */ async udise(@CurrentUser() u: JwtUser, @Res() res: any, @Query('type') type = 'enrolment', @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const s = await this.platform.settings(centreId); const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); let lines: string[] = [];
    const sts = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const bs = await db.select().from(batches).where(eq(batches.centreId, centreId)); const bn = (id: string | null) => bs.find((b) => b.id === id);
    if (type === 'students') {
      lines = [['UDISE code', 'Admission no', 'Student name', 'Gender', 'Date of birth', 'Class', 'Section', "Father's name", "Mother's name", 'Category', 'Religion', 'Blood group', 'Address', 'Guardian mobile', 'Admission date'].map(esc).join(','), ...sts.map((x) => [s.udiseCode, x.admissionNo, x.name, x.gender, x.dob, bn(x.batchId)?.className || x.className, bn(x.batchId)?.section, x.fatherName || x.parentName, x.motherName, x.category, x.religion, x.bloodGroup, x.address, x.parentMobile, x.admissionDate].map(esc).join(','))];
    } else if (type === 'staff') {
      const emps = await db.select().from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'employee'))); const us = await db.select().from(users).where(eq(users.centreId, centreId));
      lines = [['UDISE code', 'Name', 'Mobile', 'Designation', 'Department', 'Date of joining', 'Qualification', 'Experience (yrs)', 'Employment type', 'Status'].map(esc).join(','), ...emps.map((e) => { const d = JSON.parse(e.data); return [s.udiseCode, e.title, us.find((x) => x.id === e.staffId)?.mobile, d.designation, d.department, d.doj, d.qualification, d.experience, d.employmentType, e.status].map(esc).join(','); })];
    } else {
      const classes = [...new Set(bs.map((b) => b.className || b.name))]; const cats = ['General', 'OBC', 'SC', 'ST', 'EWS'];
      lines = [`${esc('School')},${esc(ce.name)},${esc('UDISE')},${esc(s.udiseCode)},${esc('Session')},${esc(s.academicSession)}`, '', ['Class', 'Sections', 'Boys', 'Girls', 'Other', 'Total', ...cats].map(esc).join(','), ...classes.map((cl) => { const ids = bs.filter((b) => (b.className || b.name) === cl).map((b) => b.id); const m = sts.filter((x) => ids.includes(x.batchId!)); return [cl, ids.length, m.filter((x) => x.gender === 'Male').length, m.filter((x) => x.gender === 'Female').length, m.filter((x) => x.gender && !['Male', 'Female'].includes(x.gender)).length, m.length, ...cats.map((k) => m.filter((x) => x.category === k).length)].join(','); }), ['Total', bs.length, sts.filter((x) => x.gender === 'Male').length, sts.filter((x) => x.gender === 'Female').length, '', sts.length].join(',')];
    }
    res.setHeader('Content-Type', 'text/csv'); res.setHeader('Content-Disposition', `attachment; filename="udise-${type}.csv"`); res.end('\ufeff' + lines.join('\n'));
  }
}
