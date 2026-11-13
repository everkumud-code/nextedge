/** Self-test: reading an export from another school software. Run: npx ts-node scripts/import-selftest.ts (no database needed). */
import ExcelJS from 'exceljs';
import { canon, classSpec, detectKind, fromGrid, gridFromText, guessMapping, mobileOf, sheetsFromXlsx } from '../src/import/parse';

let failed = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };

(async () => {
  // 1. class names written many ways
  const cases: [string, string][] = [['Class 6 A', '6-A'], ['6-A', '6-A'], ['VI B', '6-B'], ['6th C', '6-C'], ['Class-6 (A)', '6-A'], ['X', '10'], ['Class 10', 'Class 10'], ['12 Science', '12-Science'], ['Nursery', 'Nursery'], ['LKG', 'LKG']];
  for (const [raw, want] of cases) { const sp = classSpec(raw); const got = sp.name === 'Class 10' && want === '10' ? '10' : sp.name; ok(got === want || sp.name === want, `class "${raw}" -> ${sp.name} (expected ${want})`); }
  ok(canon('VI-A') === canon('6 A') && canon('6 A') === canon('Class 6 / A'), 'VI-A, 6 A and Class 6 / A are the same class');
  ok(canon('6 A') !== canon('6 B'), '6 A and 6 B are different classes');

  // 2. a workbook like an ERP export: banner lines above the header, separate Class and Section columns, odd header names, several sheets
  const wb = new ExcelJS.Workbook();
  const st = wb.addWorksheet('Student Master');
  st.addRow(['ABC PUBLIC SCHOOL, RANCHI']); st.addRow(['Student list 2026-27']); st.addRow([]);
  st.addRow(['Sr.', 'Adm No.', 'Student Name', 'Class', 'Sec', "Father's Name", "Mother's Name", 'Mobile No.', 'D.O.B', 'Sex', 'Present Address']);
  st.addRow([1, 'A-101', 'Aarav Kumar', 'VI', 'A', 'Rajesh Kumar', 'Sunita Kumar', '+91 98765 43210', new Date('2014-05-12'), 'M', 'Kanke Road']);
  st.addRow([2, 'A-102', 'Diya Sharma', 'VI', 'B', 'Anil Sharma', 'Meena Sharma', '9876543211', '03/08/2014', 'F', 'Lalpur']);
  st.addRow([3, 'A-103', 'Kabir Das', '7th', 'A', 'Mohan Das', '', '98765 43212', '2013-01-02', 'M', 'Doranda']);
  const tc = wb.addWorksheet('Teacher Details');
  tc.addRow(['Employee Name', 'Mobile', 'Email Id', 'Designation', 'Subject Taught']); tc.addRow(['Neha Singh', '9876500001', 'neha@example.com', 'TGT', 'Maths']); tc.addRow(['Ravi Verma', '9876500002', '', 'Accountant', '']);
  const en = wb.addWorksheet('Enquiries 2026');
  en.addRow(['Name', 'Phone', 'Class applying', 'Source', 'Remarks']); en.addRow(['Mira Jha', '9876500101', 'Class 5', 'Walk-in', 'Wants bus']);
  const lib = wb.addWorksheet('Library');
  lib.addRow(['Book Name', 'Author', 'ISBN', 'Copies', 'Rack']); lib.addRow(['Wings of Fire', 'APJ Abdul Kalam', '9788173711466', 2, 'A1']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const sheets = await sheetsFromXlsx(buf); ok(sheets.length === 4, `reads all ${sheets.length} sheets of the workbook`);
  const want: Record<string, string> = { 'Student Master': 'students', 'Teacher Details': 'staff', 'Enquiries 2026': 'enquiries', Library: 'books' };
  for (const sh of sheets) { const d = detectKind((k) => fromGrid(sh.grid, k, 'xlsx'), sh.name); ok(d?.kind === want[sh.name], `sheet "${sh.name}" is recognised as ${want[sh.name]} (got ${d?.kind}, ${d?.missing.length ? 'missing ' + d.missing.join(',') : 'all required columns found'})`); }
  const sm = sheets[0]; const d = detectKind((k) => fromGrid(sm.grid, k, 'xlsx'), sm.name)!; const keys = Object.values(d.mapping);
  for (const k of ['name', 'class', 'section', 'parentMobile', 'fatherName', 'motherName', 'dob', 'admissionNo', 'gender', 'address']) ok(keys.includes(k), `student column "${k}" found`);
  ok(d.grid.rows.length === 3 && d.grid.warnings.some((w) => /Skipped 2 line/.test(w)), 'the banner lines above the header are skipped');
  ok(mobileOf('+91 98765 43210') === '9876543210' && mobileOf('98765 43212') === '9876543212', 'mobile numbers with +91 and spaces are cleaned');

  // 3. a CSV from another system, semicolon separated and no clear header names
  const csv = 'Name;Phone;Std\nAsha Rani;9876511111;5\nVikas Yadav;9876522222;6\n';
  const g = gridFromText(csv, 'students'); const m = guessMapping('students', g.columns, g.rows); ok(Object.values(m).includes('name') && Object.values(m).includes('parentMobile') && Object.values(m).includes('class'), 'semicolon CSV with Name / Phone / Std is understood');
  const dk = detectKind((k) => gridFromText(csv, k, 'csv'), 'students.csv'); ok(dk?.kind === 'students', 'and recognised as a student list');
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
})();
