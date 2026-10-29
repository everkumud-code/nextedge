// Reads a spreadsheet, CSV, Word file, PDF or text into a plain grid of cells, then maps the columns to the fields of what is being imported.
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
// pdfjs is ESM-only; a real dynamic import keeps it working from compiled CommonJS code.
const importEsm = new Function('s', 'return import(s)') as (s: string) => Promise<any>;

export type Grid = { columns: string[]; rows: string[][]; source: string; warnings: string[] };
export type FieldDef = { key: string; label: string; required?: boolean; synonyms: string[] };
export const KINDS: Record<string, { label: string; fields: FieldDef[] }> = {
  students: { label: 'Students', fields: [
    { key: 'name', label: 'Student name', required: true, synonyms: ['name', 'student', 'student name', 'child', 'child name', 'full name', 'pupil', 'name of student'] },
    { key: 'class', label: 'Class / section', synonyms: ['class', 'section', 'class section', 'class sec', 'grade', 'std', 'standard', 'class & section', 'class and section'] },
    { key: 'rollNo', label: 'Roll no', synonyms: ['roll', 'roll no', 'roll number', 'rollno', 'r no', 'rno'] },
    { key: 'parentMobile', label: 'Parent mobile', required: true, synonyms: ['mobile', 'parent mobile', 'father mobile', 'contact', 'contact no', 'phone', 'phone no', 'mobile no', 'mob', 'parent contact', 'guardian mobile', 'whatsapp'] },
    { key: 'fatherName', label: "Father's name", synonyms: ['father', 'father name', 'fathers name', "father's name", 's/o', 'd/o', 'parent', 'parent name', 'guardian', 'guardian name'] },
    { key: 'motherName', label: "Mother's name", synonyms: ['mother', 'mother name', 'mothers name', "mother's name"] },
    { key: 'parentEmail', label: 'Parent email', synonyms: ['email', 'e mail', 'parent email', 'email id', 'mail'] },
    { key: 'dob', label: 'Date of birth', synonyms: ['dob', 'date of birth', 'birth date', 'birthday', 'd o b'] },
    { key: 'gender', label: 'Gender', synonyms: ['gender', 'sex', 'm/f'] },
    { key: 'admissionNo', label: 'Admission no', synonyms: ['adm no', 'admission no', 'admission number', 'admn no', 'scholar no', 'scholar number', 'enrollment no', 'enrolment no'] },
    { key: 'address', label: 'Address', synonyms: ['address', 'residence', 'village', 'locality', 'city'] },
    { key: 'category', label: 'Category', synonyms: ['category', 'caste category', 'cat'] },
    { key: 'bloodGroup', label: 'Blood group', synonyms: ['blood group', 'blood', 'bg'] },
  ] },
  staff: { label: 'Teachers & staff', fields: [
    { key: 'name', label: 'Name', required: true, synonyms: ['name', 'teacher', 'teacher name', 'staff', 'staff name', 'employee', 'employee name', 'faculty', 'full name'] },
    { key: 'mobile', label: 'Mobile', required: true, synonyms: ['mobile', 'mobile no', 'phone', 'phone no', 'contact', 'contact no', 'mob', 'whatsapp'] },
    { key: 'email', label: 'Email', synonyms: ['email', 'e mail', 'email id', 'mail'] },
    { key: 'role', label: 'Teacher or staff', synonyms: ['role', 'type', 'category', 'teaching non teaching', 'teaching/non-teaching'] },
    { key: 'title', label: 'Subject / designation', synonyms: ['subject', 'designation', 'post', 'title', 'department', 'teaches', 'subject taught'] },
  ] },
  enquiries: { label: 'Admission enquiries', fields: [
    { key: 'name', label: 'Student name', required: true, synonyms: ['name', 'student', 'student name', 'child', 'child name'] },
    { key: 'mobile', label: 'Mobile', required: true, synonyms: ['mobile', 'phone', 'contact', 'mobile no', 'parent mobile'] },
    { key: 'class', label: 'Class', synonyms: ['class', 'grade', 'std', 'class applying', 'class interested'] },
    { key: 'source', label: 'Source', synonyms: ['source', 'reference', 'how heard'] },
    { key: 'notes', label: 'Notes', synonyms: ['notes', 'remarks', 'remark', 'comment', 'comments'] },
  ] },
  books: { label: 'Library books', fields: [
    { key: 'title', label: 'Book title', required: true, synonyms: ['title', 'book', 'book name', 'book title', 'name'] },
    { key: 'author', label: 'Author', synonyms: ['author', 'writer', 'by'] },
    { key: 'isbn', label: 'ISBN / code', synonyms: ['isbn', 'code', 'book no', 'accession no', 'acc no', 'book code'] },
    { key: 'subject', label: 'Subject', synonyms: ['subject', 'category', 'class'] },
    { key: 'copies', label: 'Copies', synonyms: ['copies', 'qty', 'quantity', 'no of copies', 'count'] },
    { key: 'shelf', label: 'Shelf', synonyms: ['shelf', 'rack', 'location'] },
    { key: 'price', label: 'Price', synonyms: ['price', 'cost', 'rate', 'mrp'] },
  ] },
  items: { label: 'Inventory items', fields: [
    { key: 'title', label: 'Item', required: true, synonyms: ['item', 'item name', 'name', 'article', 'particulars', 'description'] },
    { key: 'category', label: 'Category', synonyms: ['category', 'type', 'group'] },
    { key: 'qty', label: 'Quantity', synonyms: ['qty', 'quantity', 'stock', 'nos', 'number', 'count', 'balance'] },
    { key: 'unit', label: 'Unit', synonyms: ['unit', 'uom'] },
    { key: 'minQty', label: 'Reorder below', synonyms: ['min', 'min qty', 'reorder', 'reorder level', 'minimum'] },
    { key: 'location', label: 'Location', synonyms: ['location', 'room', 'store', 'place'] },
  ] },
};

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9/& ]+/g, ' ').replace(/\s+/g, ' ').trim();
const clean = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Suggest which field each column holds (header text first, then what the cells look like). Returns column index -> field key. */
export function guessMapping(kind: string, columns: string[], rows: string[][]): Record<number, string> {
  const defs = KINDS[kind].fields; const out: Record<number, string> = {}; const used = new Set<string>();
  const norms = columns.map(norm); const IGNORE = ['sr', 'sr no', 'sno', 's no', 'sl no', 'serial', 'serial no', 'no', '#', 'sl'];
  norms.forEach((n, i) => { if (!n || IGNORE.includes(n)) return; const d = defs.find((x) => !used.has(x.key) && x.synonyms.includes(n)); if (d) { out[i] = d.key; used.add(d.key); } });
  norms.forEach((n, i) => { if (!n || out[i] || IGNORE.includes(n)) return; const d = defs.find((x) => !used.has(x.key) && x.synonyms.some((sy) => sy.length > 3 && (n.includes(sy) || (n.length > 3 && sy.includes(n))))); if (d) { out[i] = d.key; used.add(d.key); } });
  // columns whose header said nothing: recognise by content
  const mobileKey = defs.find((d) => /mobile/i.test(d.key))?.key;
  columns.forEach((_, i) => { if (out[i]) return; const vals = rows.slice(0, 30).map((r) => clean(r[i])).filter(Boolean); if (!vals.length) return;
    if (mobileKey && !used.has(mobileKey) && vals.filter((v) => /^[6-9]\d{9}$/.test(mobileOf(v))).length >= vals.length * 0.7) { out[i] = mobileKey; used.add(mobileKey); }
    else if (defs.some((d) => d.key === 'parentEmail' || d.key === 'email') && vals.filter((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)).length >= vals.length * 0.7) { const k = defs.find((d) => d.key === 'parentEmail' || d.key === 'email')!.key; if (!used.has(k)) { out[i] = k; used.add(k); } } });
  const nameKey = defs.find((d) => d.key === 'name' || d.key === 'title')?.key; if (nameKey && !used.has(nameKey)) { const i = columns.findIndex((_, j) => !out[j] && rows.slice(0, 30).filter((r) => /^[A-Za-z][A-Za-z .'-]{2,}$/.test(clean(r[j]))).length >= Math.min(rows.length, 30) * 0.7); if (i >= 0) out[i] = nameKey; }
  return out;
}

const headerLike = (cells: string[], kind: string) => { const defs = KINDS[kind].fields; return cells.filter((c) => defs.some((d) => d.synonyms.includes(norm(c)))).length; };
/** A grid of cells -> columns + rows: the header row is the first early row that looks like one. */
export function fromGrid(grid: string[][], kind: string, source: string): Grid {
  const g = grid.map((r) => r.map(clean)).filter((r) => r.some(Boolean)); const warnings: string[] = []; if (!g.length) return { columns: [], rows: [], source, warnings: ['The file has no rows'] };
  let h = 0; let best = -1; g.slice(0, 12).forEach((r, i) => { const s = headerLike(r, kind) * 10 + (r.filter(Boolean).length >= 2 && r.every((c) => !/^\d+$/.test(c)) ? 1 : 0); if (s > best) { best = s; h = i; } });
  const width = Math.max(...g.map((r) => r.length)); const columns = Array.from({ length: width }, (_, i) => g[h][i] || `Column ${i + 1}`); const rows = g.slice(h + 1).map((r) => Array.from({ length: width }, (_, i) => r[i] || ''));
  if (h > 0) warnings.push(`Skipped ${h} line(s) above the header`); return { columns, rows, source, warnings };
}

export async function gridFromXlsx(buf: Buffer, kind: string): Promise<Grid> {
  const wb = new ExcelJS.Workbook(); try { await wb.xlsx.load(buf as any); } catch { throw new Error('This Excel file could not be read. Save it as .xlsx (not .xls) and try again.'); }
  const ws = wb.worksheets.filter((w) => w.rowCount > 0).sort((a, b) => b.rowCount - a.rowCount)[0]; if (!ws) throw new Error('The workbook is empty');
  const cell = (v: any): string => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? (v.text ?? v.result ?? (v.richText ? v.richText.map((t: any) => t.text).join('') : '')) : String(v));
  const grid: string[][] = []; ws.eachRow({ includeEmpty: false }, (row) => { const out: string[] = []; row.eachCell({ includeEmpty: true }, (c, n) => { out[n - 1] = cell(c.value); }); grid.push(Array.from(out, (x) => x ?? '')); });
  const g = fromGrid(grid, kind, 'xlsx'); if (wb.worksheets.length > 1) g.warnings.push(`Read the sheet "${ws.name}" (the biggest of ${wb.worksheets.length})`); return g;
}
const splitDelimited = (line: string, d: string) => { const out: string[] = []; let cur = ''; let q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === d && !q) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
export function gridFromText(text: string, kind: string, source = 'csv'): Grid {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim()); if (!lines.length) return { columns: [], rows: [], source, warnings: ['The file is empty'] };
  const sample = lines.slice(0, 10); const delim = ['\t', ';', '|', ','].map((d) => ({ d, n: Math.min(...sample.map((l) => splitDelimited(l, d).length)) })).sort((a, b) => b.n - a.n)[0];
  if (delim.n >= 2) return fromGrid(lines.map((l) => splitDelimited(l, delim.d)), kind, source);
  return gridFromLines(lines, kind, source);
}
/** Text copied out of a PDF or Word file: split each line into cells (tabs, wide gaps, pipes), or read "1 Aarav Kumar 9876543210" style register lines. */
export function gridFromLines(lines: string[], kind: string, source: string): Grid {
  const ls = lines.map((l) => l.trim()).filter(Boolean); const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.includes('|') ? l.split('|') : l.split(/\s{2,}/)).map(clean);
  const counts = new Map<number, number>(); ls.forEach((l) => counts.set(split(l).length, (counts.get(split(l).length) || 0) + 1)); const [w, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] || [1, 0];
  if (w >= 2 && n >= Math.max(2, ls.length * 0.5)) return fromGrid(ls.map(split).filter((r) => r.length === w || r.length === w - 1), kind, source);
  // register style: optional serial/roll, a name, optionally a mobile at the end
  const rows: string[][] = []; for (const l of ls) { const m = l.match(/^(\d{1,4})[.)\-\s]+([A-Za-z][A-Za-z .'-]+?)(?:\s+((?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}))?\s*$/); if (m) rows.push([m[1], clean(m[2]), (m[3] || '').replace(/[\s-]/g, '')]); }
  if (rows.length >= 2) { const hasMobile = rows.some((r) => r[2]); const g: Grid = { columns: kind === 'students' ? ['Roll no', 'Student name', ...(hasMobile ? ['Parent mobile'] : [])] : ['No', 'Name', ...(hasMobile ? ['Mobile'] : [])], rows: rows.map((r) => (hasMobile ? r : r.slice(0, 2))), source, warnings: ['Read as a numbered list'] }; return g; }
  return { columns: [], rows: [], source, warnings: ['No table could be found in the text'] };
}
export async function gridFromDocx(buf: Buffer, kind: string): Promise<Grid> {
  const { value: html } = await mammoth.convertToHtml({ buffer: buf }); const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => c[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'))));
  if (tables.length) { const t = tables.sort((a, b) => b.length - a.length)[0]; const g = fromGrid(t, kind, 'docx-table'); if (tables.length > 1) g.warnings.push(`Read the biggest of ${tables.length} tables`); return g; }
  const { value: text } = await mammoth.extractRawText({ buffer: buf }); return gridFromLines(text.split(/\r?\n/), kind, 'docx-text');
}
/** Text of a PDF, line by line, with a tab wherever there is a wide gap (so table columns stay apart). Empty for a scanned PDF. */
export async function pdfLines(buf: Buffer): Promise<string[]> {
  const pdfjs = await importEsm('pdfjs-dist/legacy/build/pdf.mjs'); const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise; const lines: string[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, 40); p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent(); const items = (tc.items as any[]).filter((i) => String(i.str).trim()).map((i) => ({ x: i.transform[4] as number, y: i.transform[5] as number, w: (i.width as number) || 0, s: String(i.str) }));
    items.sort((a, b) => b.y - a.y || a.x - b.x); const rows: typeof items[] = []; for (const it of items) { const last = rows[rows.length - 1]; if (last && Math.abs(last[0].y - it.y) <= 3) last.push(it); else rows.push([it]); }
    for (const r of rows) { r.sort((a, b) => a.x - b.x); let line = r[0].s; for (let i = 1; i < r.length; i++) { const gap = r[i].x - (r[i - 1].x + r[i - 1].w); line += (gap > 7 ? '\t' : gap > 0.5 ? ' ' : '') + r[i].s; } lines.push(line); }
  }
  return lines;
}
/** PDF with a text layer. A scanned PDF (no text, or unreadable) returns null: it needs the AI reader like a photo. */
export async function gridFromPdf(buf: Buffer, kind: string): Promise<Grid | null> {
  let lines: string[] = []; try { lines = await pdfLines(buf); } catch { return null; }
  if (lines.join('').replace(/\s/g, '').length < 30) return null; const g = gridFromLines(lines, kind, 'pdf-text'); return g.rows.length ? g : null;
}

// ---------- cleaning of single values ----------
export const mobileOf = (v: any) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
export function dateOf(v: any): string | undefined {
  const s = clean(v); if (!s) return undefined; let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/); if (m) { let y = Number(m[3]); if (y < 100) y += y > 30 ? 1900 : 2000; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5); return d.toISOString().slice(0, 10); } const t = Date.parse(s); return Number.isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}
export const genderOf = (v: any) => { const s = clean(v).toLowerCase(); return /^(m|male|boy|b)$/.test(s) ? 'Male' : /^(f|female|girl|g)$/.test(s) ? 'Female' : s ? 'Other' : undefined; };
export const classKey = (s: any) => clean(s).toLowerCase().replace(/\b(class|std|standard|grade)\b/g, '').replace(/[^a-z0-9]/g, '');
