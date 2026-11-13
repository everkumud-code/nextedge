import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, enquiries, records, staffPermissions, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { FACULTY_DEFAULT, MODULES } from '../common/permissions';
import { StudentsService } from '../students/students.service';
import { KINDS, Grid, canon, classKey, classSpec, dateOf, detectKind, fromGrid, genderOf, gridFromDocx, gridFromLines, gridFromPdf, gridFromText, gridFromXlsx, guessMapping, mobileOf, pdfLines, sheetsFromXlsx } from './parse';
import { aiReady, extractWithAi } from './ai';

const MAX = 12 * 1024 * 1024; const MAX_ROWS = 1500; const clean = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();
type Row = Record<string, any>; type Out = { index: number; status: 'ok' | 'created' | 'skipped' | 'error'; reason?: string; id?: string };

/** Import from Excel, CSV, Word, PDF or a photo of a register: read -> check the columns -> dry run -> import. */
@Controller('import')
@Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
export class ImportController {
  constructor(private dbs: DbService, private studentsSvc: StudentsService) {}

  @Get('kinds') kinds(@CurrentUser() u: JwtUser) { return { ai: aiReady(), kinds: Object.entries(KINDS).filter(([k]) => k !== 'staff' || ['ADMIN', 'SUPER_ADMIN'].includes(u.role)).map(([key, v]) => ({ key, label: v.label, fields: v.fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required })) })) }; }

  /** Step 1: read the file. Returns the table as found plus a guess of what each column is. */
  @Post('extract') async extract(@CurrentUser() u: JwtUser, @Body() b: { kind: string; file: { name: string; mime: string; data: string } }, @Query('centreId') c?: string) {
    centreOf(u, c); const kind = b.kind; if (!KINDS[kind]) throw new BadRequestException('Choose what you are importing'); if (kind === 'staff' && !['ADMIN', 'SUPER_ADMIN'].includes(u.role)) throw new BadRequestException('Only the owner can import staff');
    const f = b.file; if (!f?.data) throw new BadRequestException('Choose a file'); const raw = String(f.data).replace(/^data:[^,]+,/, ''); const buf = Buffer.from(raw, 'base64'); if (!buf.length) throw new BadRequestException('The file is empty'); if (buf.length > MAX) throw new BadRequestException('The file is larger than 12 MB');
    const name = String(f.name || '').toLowerCase(); const ext = name.split('.').pop() || ''; const mime = String(f.mime || '').toLowerCase(); let grid: Grid | null = null; let aiRows: Row[] | null = null;
    try {
      if (ext === 'xlsx' || /spreadsheetml/.test(mime)) grid = await gridFromXlsx(buf, kind);
      else if (ext === 'xls') throw new Error('Old .xls files are not supported. Open it in Excel and "Save as" .xlsx, then upload again.');
      else if (['csv', 'tsv', 'txt'].includes(ext) || /^text\//.test(mime)) grid = gridFromText(buf.toString('utf8'), kind, ext === 'txt' ? 'text' : 'csv');
      else if (ext === 'docx' || /wordprocessingml/.test(mime)) grid = await gridFromDocx(buf, kind);
      else if (ext === 'doc') throw new Error('Old .doc files are not supported. Open it in Word and "Save as" .docx, then upload again.');
      else if (ext === 'pdf' || mime === 'application/pdf') { grid = await gridFromPdf(buf, kind); if (!grid) aiRows = await extractWithAi(kind, 'application/pdf', raw); }
      else if (/^image\/(jpeg|png|webp|gif)$/.test(mime) || ['jpg', 'jpeg', 'png', 'webp'].includes(ext)) aiRows = await extractWithAi(kind, mime.startsWith('image/') ? mime : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', raw);
      else throw new Error('This file type is not supported. Use Excel (.xlsx), CSV, Word (.docx), PDF or a photo (JPG/PNG).');
    } catch (e: any) { throw new BadRequestException(e.message); }
    const defs = KINDS[kind].fields;
    if (aiRows) { const columns = defs.map((d) => d.label); const rows = aiRows.slice(0, MAX_ROWS).map((r) => defs.map((d) => clean(r[d.key]))); const keep = defs.map((_, i) => rows.some((r) => r[i])); const cols = columns.filter((_, i) => keep[i]); const mapping: Record<number, string> = {}; defs.filter((_, i) => keep[i]).forEach((d, i) => (mapping[i] = d.key)); return { source: aiRows.length && grid === null && ext === 'pdf' ? 'ai-pdf' : 'ai-photo', columns: cols, rows: rows.map((r) => r.filter((_, i) => keep[i])), mapping, warnings: ['Read by AI from the picture. Please check every row — handwriting can be misread.'], total: aiRows.length }; }
    const g = grid!; if (!g.rows.length) throw new BadRequestException(g.warnings[0] || 'No rows were found in this file'); const warnings = [...g.warnings]; if (g.rows.length > MAX_ROWS) warnings.push(`Only the first ${MAX_ROWS} of ${g.rows.length} rows are read`);
    return { source: g.source, columns: g.columns, rows: g.rows.slice(0, MAX_ROWS), mapping: guessMapping(kind, g.columns, g.rows), warnings, total: g.rows.length };
  }

  /** Moving from another software: read ANY export (every sheet of a workbook, CSV, Word, text PDF) and say what each list is. Needs no centre, so it can run before the client exists. */
  @Post('auto') async auto(@Body() b: { file: { name: string; mime: string; data: string }; kind?: string }) {
    const only = b.kind && KINDS[b.kind] ? b.kind : undefined;
    const f = b.file; if (!f?.data) throw new BadRequestException('Choose a file'); const raw = String(f.data).replace(/^data:[^,]+,/, ''); const buf = Buffer.from(raw, 'base64'); if (!buf.length) throw new BadRequestException('The file is empty'); if (buf.length > MAX) throw new BadRequestException('The file is larger than 12 MB');
    const name = String(f.name || '').toLowerCase(); const ext = name.split('.').pop() || ''; const mime = String(f.mime || '').toLowerCase(); const found: { sheet: string; det: ReturnType<typeof detectKind>; note?: string }[] = [];
    try {
      if (ext === 'xlsx' || /spreadsheetml/.test(mime)) { for (const sh of await sheetsFromXlsx(buf)) found.push({ sheet: sh.name, det: detectKind((k) => fromGrid(sh.grid, k, 'xlsx'), sh.name, only) }); }
      else if (ext === 'xls') throw new Error('Old .xls files are not supported. Open it in Excel and "Save as" .xlsx, then upload again.');
      else if (['csv', 'tsv', 'txt'].includes(ext) || /^text\//.test(mime)) { const text = buf.toString('utf8'); found.push({ sheet: f.name, det: detectKind((k) => gridFromText(text, k, 'csv'), f.name, only) }); }
      else if (ext === 'docx' || /wordprocessingml/.test(mime)) { const cache = new Map<string, Grid>(); for (const k of Object.keys(KINDS)) cache.set(k, await gridFromDocx(buf, k)); found.push({ sheet: f.name, det: detectKind((k) => cache.get(k) as Grid, f.name, only) }); }
      else if (ext === 'pdf' || mime === 'application/pdf') { let lines: string[] = []; try { lines = await pdfLines(buf); } catch { lines = []; } if (lines.join('').replace(/\s/g, '').length < 30) throw new Error('This looks like a scanned PDF. Use Import data inside the client: it can read scans and photos with the AI reader.'); found.push({ sheet: f.name, det: detectKind((k) => gridFromLines(lines, k, 'pdf-text'), f.name, only) }); }
      else throw new Error('This file type is not supported here. Use Excel (.xlsx), CSV, Word (.docx) or a text PDF. For a photo of a register use Import data inside the client.');
    } catch (e: any) { throw new BadRequestException(e.message); }
    const files = found.filter((x) => x.det).map((x) => { const d = x.det!; return { sheet: x.sheet, kind: d.kind, label: d.label, missing: d.missing, columns: d.grid.columns, rows: d.grid.rows.slice(0, MAX_ROWS), total: d.grid.rows.length, mapping: d.mapping, warnings: d.grid.warnings, score: Math.round(d.score) }; });
    if (!files.length) throw new BadRequestException('No list of students, staff, enquiries, books or stock could be found in this file');
    return { files, sheetsSkipped: found.length - files.length };
  }

  /** A ready-to-fill template (CSV) for one kind of list. */
  @Get('template/:kind') template(@Param('kind') kind: string, @Res({ passthrough: true }) res: any) {
    const k = KINDS[kind]; if (!k) throw new BadRequestException('Unknown list'); const sample: Record<string, string[][]> = {
      students: [['Aarav Kumar', 'Class 6 A', '1', '9876543210', 'Rajesh Kumar', 'Sunita Kumar', 'rajesh@example.com', '2014-05-12', 'Male', 'ADM-1001', 'Kanke Road, Ranchi'], ['Diya Sharma', 'Class 6 B', '2', '9876543211', 'Anil Sharma', 'Meena Sharma', '', '2014-08-03', 'Female', 'ADM-1002', 'Lalpur, Ranchi']],
      staff: [['Neha Singh', '9876500001', 'neha@example.com', 'Teacher', 'Maths'], ['Ravi Verma', '9876500002', '', 'Staff', 'Accountant']],
      enquiries: [['Kabir Das', '9876500101', 'Class 5', 'Walk-in', 'Wants a bus facility']],
      books: [['Wings of Fire', 'A. P. J. Abdul Kalam', '9788173711466', 'Biography', '2', 'A1', '250']],
      items: [['Whiteboard marker', 'Stationery', '40', 'pcs', '10', 'Store room']] };
    const fields = k.fields.map((f) => f.label); const keys = k.fields.map((f) => f.key);
    // the sample rows follow the order of the field list for that kind
    const order: Record<string, string[]> = { students: ['name', 'class', 'rollNo', 'parentMobile', 'fatherName', 'motherName', 'parentEmail', 'dob', 'gender', 'admissionNo', 'address'], staff: ['name', 'mobile', 'email', 'role', 'title'], enquiries: ['name', 'mobile', 'class', 'source', 'notes'], books: ['title', 'author', 'isbn', 'subject', 'copies', 'shelf', 'price'], items: ['title', 'category', 'qty', 'unit', 'minQty', 'location'] };
    const cols = order[kind].filter((c) => keys.includes(c)); const head = cols.map((c) => k.fields.find((f) => f.key === c)!.label);
    const csv = [head, ...sample[kind]].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n'); void fields;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="nextedge-${kind}-template.csv"`); return '\uFEFF' + csv;
  }

  /** Step 2/3: check (dryRun) or import rows that are already mapped to the fields. */
  @Post('commit') async commit(@CurrentUser() u: JwtUser, @Body() b: { kind: string; rows: Row[]; batchId?: string; dryRun?: boolean; createClasses?: boolean }, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); if (!KINDS[b.kind]) throw new BadRequestException('Choose what you are importing'); const rows = Array.isArray(b.rows) ? b.rows.slice(0, MAX_ROWS) : []; if (!rows.length) throw new BadRequestException('Nothing to import');
    if (b.kind === 'staff' && !['ADMIN', 'SUPER_ADMIN'].includes(u.role)) throw new BadRequestException('Only the owner can import staff');
    const made: string[] = []; const out: Out[] = b.kind === 'students' ? await this.students(centreId, rows, b.batchId, !!b.dryRun, !!b.createClasses, made) : b.kind === 'staff' ? await this.staff(centreId, rows, !!b.dryRun) : b.kind === 'enquiries' ? await this.enquiries(centreId, rows, !!b.dryRun) : await this.recordsOf(centreId, b.kind as 'books' | 'items', rows, u.id, !!b.dryRun);
    const n = (s: string) => out.filter((x) => x.status === s).length; return { dryRun: !!b.dryRun, ok: n('ok'), created: n('created'), skipped: n('skipped'), errors: n('error'), newClasses: made, results: out };
  }

  private async students(centreId: string, rows: Row[], defaultBatch: string | undefined, dry: boolean, createClasses = false, made: string[] = []): Promise<Out[]> {
    const db = this.dbs.db; const bs = await db.select().from(batches).where(eq(batches.centreId, centreId)); if (defaultBatch && !bs.some((x) => x.id === defaultBatch)) throw new BadRequestException('Unknown class');
    const have = await db.select({ name: students.name, mobile: students.parentMobile }).from(students).where(eq(students.centreId, centreId)); const seen = new Set(have.map((h) => `${clean(h.name).toLowerCase()}|${h.mobile}`)); const out: Out[] = [];
    const find = (s: string) => { const k = canon(s); if (!k) return null; const hit = bs.filter((x) => canon(x.name) === k || canon(`${x.className || ''}${x.section || ''}`) === k); if (hit.length === 1) return hit[0]; const byClass = bs.filter((x) => canon(x.className || '') === k); return byClass.length === 1 ? byClass[0] : null; };
    /** Classes found in the file that do not exist yet: made on the spot (counted only, in a dry run). */
    const ensure = async (text: string) => { const hit = find(text); if (hit || !createClasses) return hit; const sp = classSpec(text); if (!sp.name) return null; const row: any = { id: `new:${canon(text)}`, centreId, name: sp.name, className: sp.className, section: sp.section };
      if (!dry) { const [c] = await db.insert(batches).values({ centreId, name: sp.name, course: sp.className ? `Class ${sp.className}` : sp.name, className: sp.className, section: sp.section, capacity: 60 } as any).returning(); row.id = c.id; } bs.push(row); made.push(sp.name); return row; };
    for (let i = 0; i < rows.length; i++) {
      const r = { ...rows[i] }; if (clean(r.section) && clean(r.class) && !new RegExp('(^|[^a-z0-9])' + clean(r.section).replace(/[^a-z0-9]/gi, '') + '$', 'i').test(clean(r.class))) r.class = `${clean(r.class)} ${clean(r.section)}`; else if (clean(r.section) && !clean(r.class)) r.class = clean(r.section); const name = clean(r.name); const mob = mobileOf(r.parentMobile); const email = clean(r.parentEmail).toLowerCase();
      if (!name) { out.push({ index: i, status: 'error', reason: 'Name is missing' }); continue; } if (mob.length !== 10) { out.push({ index: i, status: 'error', reason: 'Parent mobile must be a 10-digit number' }); continue; } if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.push({ index: i, status: 'error', reason: 'Parent email is not valid' }); continue; }
      const batch = (clean(r.class) ? await ensure(String(r.class)) : null) || bs.find((x) => x.id === defaultBatch); if (clean(r.class) && !batch && !defaultBatch) { out.push({ index: i, status: 'error', reason: `Class "${clean(r.class)}" does not match any class. Fix it or choose a default class.` }); continue; } if (!batch) { out.push({ index: i, status: 'error', reason: 'No class: choose a default class or fill the class column' }); continue; }
      const key = `${name.toLowerCase()}|${mob}`; if (seen.has(key)) { out.push({ index: i, status: 'skipped', reason: 'Already exists (same name and parent mobile)' }); continue; }
      seen.add(key); if (dry) { out.push({ index: i, status: 'ok' }); continue; }
      try { const st = await this.studentsSvc.create(centreId, { name, parentMobile: mob, parentName: clean(r.fatherName) || undefined, parentEmail: email || undefined, batchId: batch.id, rollNo: clean(r.rollNo) || undefined, dob: dateOf(r.dob), gender: genderOf(r.gender), fatherName: clean(r.fatherName) || undefined, motherName: clean(r.motherName) || undefined, admissionNo: clean(r.admissionNo) || undefined, address: clean(r.address) || undefined, category: clean(r.category) || undefined, bloodGroup: clean(r.bloodGroup) || undefined, apaarId: clean(r.apaarId) || undefined, pen: clean(r.pen) || undefined } as any); out.push({ index: i, status: 'created', id: st.id }); }
      catch (e: any) { out.push({ index: i, status: 'error', reason: String(e?.message || 'Could not be saved').slice(0, 140) }); }
    } return out;
  }
  private async staff(centreId: string, rows: Row[], dry: boolean): Promise<Out[]> {
    const db = this.dbs.db; const have = await db.select({ mobile: users.mobile, email: users.email }).from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF']))); const mob = new Set(have.map((h) => h.mobile)); const em = new Set(have.map((h) => (h.email || '').toLowerCase()).filter(Boolean)); const out: Out[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const name = clean(r.name); const m = mobileOf(r.mobile); const email = clean(r.email).toLowerCase(); if (!name) { out.push({ index: i, status: 'error', reason: 'Name is missing' }); continue; } if (m.length !== 10) { out.push({ index: i, status: 'error', reason: 'Mobile must be a 10-digit number' }); continue; } if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.push({ index: i, status: 'error', reason: 'Email is not valid' }); continue; }
      if (mob.has(m) || (email && em.has(email))) { out.push({ index: i, status: 'skipped', reason: 'A staff member with this mobile or email already exists' }); continue; } mob.add(m); if (email) em.add(email);
      const role = /staff|clerk|account|office|peon|driver|lab|librar|non|reception|admin/i.test(clean(r.role)) || (/clerk|accountant|office|librarian|receptionist/i.test(clean(r.title)) && !/teach/i.test(clean(r.role))) ? 'STAFF' : 'FACULTY'; if (dry) { out.push({ index: i, status: 'ok' }); continue; }
      try { const [user] = await db.insert(users).values({ centreId, name, mobile: m, email: email || undefined, role: role as any }).returning(); await db.insert(staffPermissions).values({ userId: user.id, centreId, modules: JSON.stringify(role === 'FACULTY' ? FACULTY_DEFAULT.filter((x) => (MODULES as readonly string[]).includes(x)) : []), title: clean(r.title) || undefined }); out.push({ index: i, status: 'created', id: user.id }); }
      catch (e: any) { out.push({ index: i, status: 'error', reason: String(e?.message || 'Could not be saved').slice(0, 140) }); }
    } return out;
  }
  private async enquiries(centreId: string, rows: Row[], dry: boolean): Promise<Out[]> {
    const db = this.dbs.db; const have = await db.select({ name: enquiries.name, mobile: enquiries.mobile }).from(enquiries).where(eq(enquiries.centreId, centreId)); const seen = new Set(have.map((h) => `${clean(h.name).toLowerCase()}|${h.mobile}`)); const out: Out[] = [];
    for (let i = 0; i < rows.length; i++) { const r = rows[i]; const name = clean(r.name); const m = mobileOf(r.mobile); if (!name) { out.push({ index: i, status: 'error', reason: 'Name is missing' }); continue; } if (m.length !== 10) { out.push({ index: i, status: 'error', reason: 'Mobile must be a 10-digit number' }); continue; } const key = `${name.toLowerCase()}|${m}`; if (seen.has(key)) { out.push({ index: i, status: 'skipped', reason: 'Already in the enquiries' }); continue; } seen.add(key); if (dry) { out.push({ index: i, status: 'ok' }); continue; }
      try { const [e] = await db.insert(enquiries).values({ centreId, name, mobile: m, className: clean(r.class) || undefined, source: clean(r.source) || 'import', notes: clean(r.notes) || undefined } as any).returning(); out.push({ index: i, status: 'created', id: e.id }); } catch (e: any) { out.push({ index: i, status: 'error', reason: String(e?.message || 'Could not be saved').slice(0, 140) }); } } return out;
  }
  private async recordsOf(centreId: string, kind: 'books' | 'items', rows: Row[], userId: string, dry: boolean): Promise<Out[]> {
    const db = this.dbs.db; const rk = kind === 'books' ? 'book' : 'item'; const have = await db.select({ title: records.title }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, rk))); const seen = new Set(have.map((h) => clean(h.title).toLowerCase())); const out: Out[] = [];
    for (let i = 0; i < rows.length; i++) { const r = rows[i]; const title = clean(r.title); if (!title) { out.push({ index: i, status: 'error', reason: kind === 'books' ? 'Book title is missing' : 'Item name is missing' }); continue; } if (seen.has(title.toLowerCase())) { out.push({ index: i, status: 'skipped', reason: 'Already in the list' }); continue; } seen.add(title.toLowerCase()); if (dry) { out.push({ index: i, status: 'ok' }); continue; }
      const num = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : undefined; }; const data: any = kind === 'books' ? { author: clean(r.author), isbn: clean(r.isbn), subject: clean(r.subject), copies: num(r.copies) ?? 1, shelf: clean(r.shelf), price: num(r.price) } : { category: clean(r.category), qty: num(r.qty) ?? 0, unit: clean(r.unit), minQty: num(r.minQty), location: clean(r.location) };
      Object.keys(data).forEach((k) => (data[k] === '' || data[k] === undefined) && delete data[k]); const status = kind === 'books' ? 'available' : (data.qty ?? 0) === 0 ? 'out' : data.minQty !== undefined && data.qty <= data.minQty ? 'low' : 'in-stock';
      try { const [x] = await db.insert(records).values({ centreId, kind: rk, title, status, data: JSON.stringify(data), createdBy: userId, date: new Date().toISOString().slice(0, 10) }).returning(); out.push({ index: i, status: 'created', id: x.id }); } catch (e: any) { out.push({ index: i, status: 'error', reason: String(e?.message || 'Could not be saved').slice(0, 140) }); } } return out;
  }
}
