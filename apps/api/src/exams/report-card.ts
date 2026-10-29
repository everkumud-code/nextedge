import PDFDocument from 'pdfkit';
export type Scale = { min: number; grade: string }[];
export const DEFAULT_SCALE: Scale = [{ min: 91, grade: 'A1' }, { min: 81, grade: 'A2' }, { min: 71, grade: 'B1' }, { min: 61, grade: 'B2' }, { min: 51, grade: 'C1' }, { min: 41, grade: 'C2' }, { min: 33, grade: 'D' }, { min: 0, grade: 'E' }];
export const gradeOf = (pct: number, scale: Scale = DEFAULT_SCALE) => [...scale].sort((a, b) => b.min - a.min).find((s) => pct >= s.min)?.grade || '-';

export type CardExam = { name: string; subjects: { name: string; max: number; marks: number | null; absent: boolean; grade: string }[]; total: number; maxTotal: number; pct: number; grade: string; rank: number | null; of: number };
export type CardData = { centre: { name: string; address?: string | null; board?: string | null; affiliationNo?: string | null; udise?: string | null; phone?: string | null; principal?: string | null }; session: string; term: string; student: { name: string; className: string; section?: string | null; rollNo?: string | null; admissionNo?: string | null; dob?: string | null; father?: string | null; mother?: string | null }; exams: CardExam[]; attendance?: { present: number; total: number }; remark?: { remark?: string; discipline?: string; sports?: string; arts?: string; result?: string }; scale: Scale; classTeacher?: string | null };

export function reportCardPdf(d: CardData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 }); const chunks: Buffer[] = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    const W = doc.page.width - 72; const navy = '#10243A', blue = '#1673D9', grey = '#666666';
    doc.rect(36, 30, W, 78).lineWidth(1.2).stroke(navy);
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(17).text(d.centre.name, 36, 40, { width: W, align: 'center' });
    doc.font('Helvetica').fontSize(8.5).fillColor(grey).text([d.centre.address, d.centre.phone && `Ph: ${d.centre.phone}`].filter(Boolean).join(' · '), { width: W, align: 'center' });
    doc.text([d.centre.board && `Board: ${d.centre.board}`, d.centre.affiliationNo && `Affiliation no: ${d.centre.affiliationNo}`, d.centre.udise && `UDISE: ${d.centre.udise}`].filter(Boolean).join('   '), { width: W, align: 'center' });
    doc.fillColor(blue).font('Helvetica-Bold').fontSize(12).text(`REPORT CARD  ·  ${d.term}  ·  Session ${d.session}`, 36, 86, { width: W, align: 'center' });
    // student box
    let y = 120; doc.fillColor(navy).font('Helvetica').fontSize(9.5);
    const kv = (x: number, yy: number, k: string, v?: string | null) => { doc.fillColor(grey).text(k, x, yy, { width: 80, continued: false }); doc.fillColor(navy).font('Helvetica-Bold').text(v || '—', x + 82, yy, { width: 170 }); doc.font('Helvetica'); };
    kv(36, y, 'Student', d.student.name); kv(300, y, 'Class / Section', `${d.student.className}${d.student.section ? ' - ' + d.student.section : ''}`);
    kv(36, y + 16, 'Roll no', d.student.rollNo); kv(300, y + 16, 'Admission no', d.student.admissionNo);
    kv(36, y + 32, 'Date of birth', d.student.dob); kv(300, y + 32, "Father's name", d.student.father);
    kv(36, y + 48, "Mother's name", d.student.mother); if (d.attendance) kv(300, y + 48, 'Attendance', `${d.attendance.present} / ${d.attendance.total} days (${d.attendance.total ? Math.round((d.attendance.present / d.attendance.total) * 100) : 0}%)`);
    y += 72;
    for (const ex of d.exams) {
      if (y > 640) { doc.addPage(); y = 40; }
      doc.rect(36, y, W, 18).fill(navy); doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(ex.name, 42, y + 4); doc.text(ex.rank ? `Rank ${ex.rank} of ${ex.of}` : '', 36, y + 4, { width: W - 8, align: 'right' }); y += 18;
      const cols = [36, 36 + W * 0.5, 36 + W * 0.68, 36 + W * 0.84]; const head = ['Subject', 'Max marks', 'Obtained', 'Grade'];
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(9); head.forEach((h, i) => doc.text(h, cols[i] + 4, y + 4, { width: 100 })); doc.moveTo(36, y + 17).lineTo(36 + W, y + 17).lineWidth(0.5).stroke('#bbbbbb'); y += 18;
      doc.font('Helvetica').fontSize(9.5);
      for (const s of ex.subjects) { doc.fillColor(navy).text(s.name, cols[0] + 4, y + 3, { width: W * 0.48 }); doc.text(String(s.max), cols[1] + 4, y + 3); doc.text(s.absent ? 'Absent' : s.marks === null ? '—' : String(s.marks), cols[2] + 4, y + 3); doc.font('Helvetica-Bold').text(s.absent || s.marks === null ? '—' : s.grade, cols[3] + 4, y + 3).font('Helvetica'); y += 16; doc.moveTo(36, y).lineTo(36 + W, y).lineWidth(0.3).stroke('#dddddd'); }
      doc.rect(36, y, W, 20).fill('#EAF2FC'); doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text('Total', cols[0] + 4, y + 5); doc.text(String(ex.maxTotal), cols[1] + 4, y + 5); doc.text(String(ex.total), cols[2] + 4, y + 5); doc.text(`${ex.pct.toFixed(1)}%  ${ex.grade}`, cols[3] + 4, y + 5); y += 32;
    }
    if (d.remark) {
      if (y > 640) { doc.addPage(); y = 40; }
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text('Co-scholastic & remarks', 36, y); y += 14; doc.font('Helvetica').fontSize(9.5);
      const line = [d.remark.discipline && `Discipline: ${d.remark.discipline}`, d.remark.sports && `Sports: ${d.remark.sports}`, d.remark.arts && `Art & craft: ${d.remark.arts}`].filter(Boolean).join('    '); if (line) { doc.text(line, 36, y); y += 14; }
      if (d.remark.remark) { doc.text(`Class teacher's remark: ${d.remark.remark}`, 36, y, { width: W }); y = doc.y + 6; }
      if (d.remark.result) { doc.font('Helvetica-Bold').text(`Result: ${d.remark.result}`, 36, y); y += 16; }
    }
    if (y > 700) { doc.addPage(); y = 40; }
    doc.font('Helvetica').fontSize(8).fillColor(grey).text('Grading: ' + [...d.scale].sort((a, b) => b.min - a.min).map((s, i, a) => `${s.grade} (${s.min}${i === 0 ? '–100' : '–' + (a[i - 1].min - 1)})`).join('  ·  '), 36, 760 - 30, { width: W });
    const sy = 790; doc.fillColor(navy).fontSize(9); [['Class teacher', d.classTeacher], ['Parent / guardian', ''], ['Principal', d.centre.principal]].forEach(([k, v], i) => { const x = 36 + i * (W / 3); doc.moveTo(x + 6, sy).lineTo(x + W / 3 - 20, sy).lineWidth(0.5).stroke('#888888'); doc.text(k as string, x + 6, sy + 3, { width: W / 3 - 26 }); if (v) doc.fillColor(grey).fontSize(8).text(v as string, x + 6, sy - 12, { width: W / 3 - 26 }).fillColor(navy).fontSize(9); });
    doc.end();
  });
}
