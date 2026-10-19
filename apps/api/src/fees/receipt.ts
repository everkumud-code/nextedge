import PDFDocument from 'pdfkit';
export function receiptPdf(d: { centre: string; city?: string | null; receiptNo: string; student: string; rollNo?: string | null; batch?: string; parent?: string | null; amount: number; mode: string; paidOn: string; reference?: string | null; balance: number }): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 }); const chunks: Buffer[] = []; doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.fontSize(16).text(d.centre, { align: 'center' }); if (d.city) doc.fontSize(9).text(d.city, { align: 'center' });
    doc.moveDown(0.5).fontSize(12).text('FEE RECEIPT', { align: 'center' }).moveDown();
    const row = (k: string, v: string) => { doc.fontSize(10).text(k, { continued: true, width: 140 }).text(v); };
    row('Receipt no', d.receiptNo); row('Date', d.paidOn); row('Student', d.student + (d.rollNo ? ` (Roll ${d.rollNo})` : '')); if (d.batch) row('Batch', d.batch); if (d.parent) row('Parent', d.parent);
    doc.moveDown(0.5); doc.fontSize(14).text(`Amount received: Rs ${d.amount.toLocaleString('en-IN')}`); doc.fontSize(10).text(`Mode: ${d.mode}${d.reference ? ` · Ref ${d.reference}` : ''}`);
    doc.moveDown(0.5).text(d.balance > 0 ? `Balance due: Rs ${d.balance.toLocaleString('en-IN')}` : 'No balance due');
    doc.moveDown(2).fontSize(8).fillColor('#666').text('Computer-generated receipt. Issued via Coaching Connect.', { align: 'center' });
    doc.end();
  });
}
