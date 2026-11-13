import PDFDocument from 'pdfkit';
import { dateInWords } from '../insights/compliance';
export type Letterhead = { name: string; address?: string | null; board?: string | null; affiliationNo?: string | null; udise?: string | null; phone?: string | null; principal?: string | null; website?: string | null };
export type Student = { name: string; father?: string | null; mother?: string | null; dob?: string | null; className?: string | null; section?: string | null; admissionNo?: string | null; admissionDate?: string | null; rollNo?: string | null; category?: string | null; gender?: string | null; address?: string | null };
export const CERT_TYPES: Record<string, { label: string; prefix: string; fields: { key: string; label: string; type?: string; options?: string[]; default?: string }[] }> = {
  transfer: { label: 'Transfer Certificate (TC)', prefix: 'TC', fields: [{ key: 'dateOfLeaving', label: 'Date of leaving', type: 'date' }, { key: 'reason', label: 'Reason for leaving', default: 'Parent’s request' }, { key: 'classLastStudied', label: 'Class last studied' }, { key: 'result', label: 'Result of last exam', type: 'select', options: ['Passed', 'Failed', 'Promoted', 'Detained', 'Not applicable'], default: 'Promoted' }, { key: 'promotedTo', label: 'Eligible for promotion to' }, { key: 'conduct', label: 'General conduct', type: 'select', options: ['Excellent', 'Very good', 'Good', 'Satisfactory'], default: 'Good' }, { key: 'duesCleared', label: 'All dues cleared', type: 'select', options: ['Yes', 'No'], default: 'Yes' }, { key: 'workingDays', label: 'Total working days' }, { key: 'daysPresent', label: 'Days present' }, { key: 'subjects', label: 'Subjects studied' }, { key: 'concession', label: 'Fee concession availed (if any)' }, { key: 'appliedOn', label: 'Date of application for TC', type: 'date' }, { key: 'remarks', label: 'Remarks' }] },
  bonafide: { label: 'Bonafide Certificate', prefix: 'BF', fields: [{ key: 'purpose', label: 'Purpose', default: 'Bank account / scholarship / passport' }, { key: 'remarks', label: 'Remarks' }] },
  character: { label: 'Character Certificate', prefix: 'CC', fields: [{ key: 'conduct', label: 'Conduct', type: 'select', options: ['Excellent', 'Very good', 'Good', 'Satisfactory'], default: 'Good' }, { key: 'remarks', label: 'Remarks' }] },
  study: { label: 'Study Certificate', prefix: 'SC', fields: [{ key: 'fromYear', label: 'Studying since (year)' }, { key: 'purpose', label: 'Purpose' }] },
  fee: { label: 'Fee Paid Certificate', prefix: 'FC', fields: [{ key: 'paid', label: 'Total fees paid (₹)', type: 'number' }, { key: 'period', label: 'For the period' }, { key: 'purpose', label: 'Purpose', default: 'Income tax rebate' }] },
};
const nice = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

export function certificatePdf(lh: Letterhead, type: string, st: Student, data: Record<string, any>, serial: string, issuedOn: string, cancelled = false): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 }); const chunks: Buffer[] = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    const W = doc.page.width - 80; const navy = '#10243A', blue = '#1673D9', grey = '#666666';
    doc.rect(28, 28, doc.page.width - 56, doc.page.height - 56).lineWidth(1.6).stroke(navy); doc.rect(34, 34, doc.page.width - 68, doc.page.height - 68).lineWidth(0.5).stroke(blue);
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(20).text(lh.name, 40, 56, { width: W, align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(grey).text([lh.address, lh.phone && `Ph: ${lh.phone}`, lh.website].filter(Boolean).join('  ·  '), { width: W, align: 'center' });
    doc.text([lh.board && `Board: ${lh.board}`, lh.affiliationNo && `Affiliation no: ${lh.affiliationNo}`, lh.udise && `UDISE: ${lh.udise}`].filter(Boolean).join('   '), { width: W, align: 'center' });
    doc.moveTo(60, 112).lineTo(doc.page.width - 60, 112).lineWidth(0.8).stroke(blue);
    const T = CERT_TYPES[type]; doc.fillColor(blue).font('Helvetica-Bold').fontSize(16).text(T.label.replace(/ \(.*\)/, '').toUpperCase(), 40, 128, { width: W, align: 'center', underline: false });
    doc.font('Helvetica').fontSize(10).fillColor(navy).text(`Serial no: ${serial}`, 56, 160).text(`Date: ${nice(issuedOn)}`, 40, 160, { width: W - 16, align: 'right' });
    const cls = [st.className, st.section && `Section ${st.section}`].filter(Boolean).join(', ');
    let y = 200; doc.font('Helvetica').fontSize(12).fillColor('#222222');
    const para = (t: string) => { doc.text(t, 64, y, { width: W - 48, align: 'justify', lineGap: 6 }); y = doc.y + 12; };
    if (type === 'transfer') {
      const rows: [string, string][] = [['Name of the student', st.name], ["Father's / guardian's name", st.father || '—'], ["Mother's name", st.mother || '—'], ['Date of birth (figures)', nice(st.dob)], ['Date of birth (in words)', dateInWords(st.dob) || '—'], ['Category', st.category || '—'], ['Admission no. & date', `${st.admissionNo || '—'}  /  ${nice(st.admissionDate)}`], ['Class last studied', data.classLastStudied || cls || '—'], ['Result of last examination', data.result || '—'], ['Eligible for promotion to', data.promotedTo || '—'], ['Subjects studied', data.subjects || '—'], ['Fee concession availed', data.concession || 'None'], ['Date of application for TC', data.appliedOn ? nice(data.appliedOn) : '—'], ['Total working days / days present', `${data.workingDays || '—'} / ${data.daysPresent || '—'}`], ['School dues cleared', data.duesCleared || '—'], ['Date of leaving the school', nice(data.dateOfLeaving)], ['Reason for leaving', data.reason || '—'], ['General conduct', data.conduct || '—'], ['Remarks', data.remarks || '—']];
      doc.fontSize(10.5); rows.forEach(([k, v], i) => { doc.rect(64, y - 3, W - 48, 22).fillAndStroke(i % 2 ? '#F4F7FB' : '#ffffff', '#dddddd'); doc.fillColor(grey).text(`${i + 1}.  ${k}`, 72, y + 2, { width: 200 }); doc.fillColor(navy).font('Helvetica-Bold').text(v, 290, y + 2, { width: 240 }).font('Helvetica'); y += 22; });
      y += 12; doc.fillColor('#222222').fontSize(10).text('Certified that the above information is in accordance with the school records.', 64, y, { width: W - 48 });
    } else if (type === 'bonafide') {
      para(`This is to certify that ${st.name}${st.gender === 'Female' ? ', daughter' : ', son'} of ${st.father || st.mother || 'Mr./Mrs. —'}, bearing admission no. ${st.admissionNo || '—'}, is a bonafide student of this school, studying in ${cls || '—'} during the current academic session.`);
      if (st.dob) para(`As per school records, ${st.gender === 'Female' ? 'her' : 'his'} date of birth is ${nice(st.dob)}.`);
      para(`This certificate is issued on request for the purpose of: ${data.purpose || '—'}.`); if (data.remarks) para(data.remarks);
    } else if (type === 'character') {
      para(`This is to certify that ${st.name}${st.gender === 'Female' ? ', daughter' : ', son'} of ${st.father || st.mother || '—'}, ${cls ? 'of ' + cls + ',' : ''} is a student of this school (admission no. ${st.admissionNo || '—'}).`);
      para(`To the best of my knowledge, ${st.gender === 'Female' ? 'her' : 'his'} character and conduct during the period of study at this school has been ${String(data.conduct || 'Good').toLowerCase()}.`); if (data.remarks) para(data.remarks);
    } else if (type === 'study') {
      para(`This is to certify that ${st.name}${st.gender === 'Female' ? ', daughter' : ', son'} of ${st.father || st.mother || '—'} has been studying in this school since ${data.fromYear || nice(st.admissionDate)} and is presently in ${cls || '—'} (admission no. ${st.admissionNo || '—'}).`); if (data.purpose) para(`Issued for: ${data.purpose}.`);
    } else if (type === 'fee') {
      para(`This is to certify that ${st.name}${st.gender === 'Female' ? ', daughter' : ', son'} of ${st.father || st.mother || '—'}, ${cls ? 'of ' + cls + ',' : ''} (admission no. ${st.admissionNo || '—'}) has paid a total fee of Rs ${Number(data.paid || 0).toLocaleString('en-IN')}${data.period ? ' for ' + data.period : ''} to this school.`); if (data.purpose) para(`Issued for: ${data.purpose}.`);
    }
    const sy = doc.page.height - 130; doc.fillColor(navy).font('Helvetica').fontSize(10); doc.moveTo(60, sy).lineTo(200, sy).lineWidth(0.6).stroke('#888888'); doc.text('Prepared by', 60, sy + 4);
    doc.moveTo(doc.page.width - 220, sy).lineTo(doc.page.width - 60, sy).stroke('#888888'); doc.text(lh.principal ? `${lh.principal}` : 'Principal', doc.page.width - 220, sy + 4, { width: 160, align: 'center' }); doc.fillColor(grey).fontSize(8).text('Principal / Authorised signatory', doc.page.width - 220, sy + 18, { width: 160, align: 'center' });
    doc.circle(doc.page.width / 2, sy - 6, 32).lineWidth(0.6).dash(3, { space: 3 }).stroke('#aaaaaa').undash(); doc.fillColor('#aaaaaa').fontSize(8).text('School seal', doc.page.width / 2 - 25, sy - 10, { width: 50, align: 'center' });
    if (cancelled) { doc.save().rotate(-30, { origin: [300, 420] }).fillColor('#cc0000').opacity(0.25).fontSize(80).font('Helvetica-Bold').text('CANCELLED', 90, 380).restore(); }
    doc.end();
  });
}
