import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, files, students } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { PlatformService } from '../platform/platform.service';

const CW = 243, CH = 153; // CR80 card (85.6 × 54 mm) in points

/** Student ID cards: one card, or a whole class laid out 10 per A4 sheet, with photo, details and a QR code. */
@Controller('idcards')
@Mod('certificates')
@Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
export class IdCardsController {
  constructor(private dbs: DbService, private platform: PlatformService) {}

  private async load(centreId: string, where: any) {
    const db = this.dbs.db; const list = await db.select().from(students).where(and(eq(students.centreId, centreId), eq(students.active, true), where)).orderBy(asc(students.name));
    list.sort((a, b) => (parseInt(a.rollNo || '0') || 9999) - (parseInt(b.rollNo || '0') || 9999) || a.name.localeCompare(b.name));
    const bs = await db.select().from(batches).where(eq(batches.centreId, centreId));
    const ph = list.length ? await db.select().from(files).where(and(eq(files.centreId, centreId), eq(files.ownerKind, 'student-photo'), inArray(files.ownerId, list.map((s) => s.id)))) : [];
    const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const set = await this.platform.settings(centreId);
    return { list, bs, ph, ce, set };
  }

  private async draw(doc: any, x: number, y: number, st: any, ctx: any) {
    const b = ctx.bs.find((q: any) => q.id === st.batchId); const navy = '#10243A', blue = '#1673D9';
    doc.save(); doc.roundedRect(x, y, CW, CH, 8).lineWidth(0.8).stroke('#9AA8B8'); doc.roundedRect(x, y, CW, 30, 8).fill(navy); doc.rect(x, y + 20, CW, 10).fill(navy);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9.5).text(ctx.ce.name, x + 6, y + 6, { width: CW - 12, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(6.5).fillColor('#BFD4EE').text(`Student Identity Card · Session ${ctx.set.academicSession || ''}`.trim(), x + 6, y + 19, { width: CW - 12, align: 'center', lineBreak: false });
    // photo
    const px = x + 8, py = y + 38; doc.rect(px, py, 56, 70).lineWidth(0.6).stroke('#9AA8B8');
    const f = ctx.ph.find((q: any) => q.ownerId === st.id); let shown = false;
    if (f && (f.mime === 'image/jpeg' || f.mime === 'image/png')) { try { doc.image(Buffer.from(f.data, 'base64'), px + 1, py + 1, { fit: [54, 68], align: 'center', valign: 'center' }); shown = true; } catch { /* unreadable image */ } }
    if (!shown) doc.fillColor('#9AA8B8').fontSize(6.5).text('PHOTO', px, py + 31, { width: 56, align: 'center', lineBreak: false });
    // details
    const dx = x + 72; let dy = y + 36; doc.fillColor(navy).font('Helvetica-Bold').fontSize(9.5).text(st.name, dx, dy, { width: CW - 80, lineBreak: false }); dy += 13;
    const row = (k: string, v?: string | null) => { if (!v) return; doc.font('Helvetica').fontSize(6.8).fillColor('#667788').text(k, dx, dy, { width: 36, lineBreak: false }); doc.font('Helvetica-Bold').fillColor(navy).text(v, dx + 36, dy, { width: CW - 118, lineBreak: false }); dy += 9.5; };
    row('Class', b ? `${b.className || b.name}${b.section ? ' - ' + b.section : ''}` : st.className); row('Roll', st.rollNo); row('Adm no', st.admissionNo); row('DOB', st.dob ? new Date(st.dob).toLocaleDateString('en-IN') : null); row('Blood', st.bloodGroup); row('Father', st.fatherName || st.parentName); row('Mobile', st.parentMobile);
    // QR + address + signature
    try { const qr = await QRCode.toBuffer(`NE|${ctx.ce.id.slice(0, 8)}|${st.admissionNo || st.id}`, { margin: 0, width: 120 }); doc.image(qr, x + CW - 42, y + CH - 52, { width: 36, height: 36 }); } catch { /* skip */ }
    doc.fillColor('#667788').font('Helvetica').fontSize(5.8).text([st.address, ctx.set.phone && `Ph ${ctx.set.phone}`].filter(Boolean).join(' · ').slice(0, 90), x + 8, y + CH - 17, { width: CW - 60, height: 10, lineBreak: false });
    doc.moveTo(x + CW - 90, y + CH - 8).lineTo(x + CW - 48, y + CH - 8).lineWidth(0.4).stroke('#667788'); doc.fontSize(5.2).text('Principal', x + CW - 90, y + CH - 7, { width: 42, align: 'center', lineBreak: false });
    doc.rect(x, y + CH - 4, CW, 4).fill(blue); doc.restore();
  }

  private async sheet(res: any, name: string, centreId: string, where: any) {
    const ctx = await this.load(centreId, where); if (!ctx.list.length) throw new NotFoundException('No students found');
    const doc = new PDFDocument({ size: 'A4', margin: 20 }); const chunks: Buffer[] = []; doc.on('data', (c) => chunks.push(c)); const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
    const per = 10; for (let i = 0; i < ctx.list.length; i++) { if (i && i % per === 0) doc.addPage(); const k = i % per; await this.draw(doc, 20 + (k % 2) * (CW + 8), 20 + Math.floor(k / 2) * (CH + 6), ctx.list[i], ctx); }
    doc.end(); const pdf = await done; res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`); res.end(pdf);
  }

  @Get('student/:id.pdf') one(@CurrentUser() u: JwtUser, @Param('id') id: string, @Res() res: any, @Query('centreId') c?: string) { return this.sheet(res, `id-card-${id.slice(0, 6)}`, centreOf(u, c), eq(students.id, id)); }
  /** A class (batchId), or specific students (ids=a,b,c). */
  @Get('cards.pdf') many(@CurrentUser() u: JwtUser, @Res() res: any, @Query('batchId') batchId?: string, @Query('ids') ids?: string, @Query('centreId') c?: string) {
    const list = (ids || '').split(',').filter((x) => /^[0-9a-f-]{36}$/i.test(x)); if (!batchId && !list.length) throw new BadRequestException('Choose a class or students');
    return this.sheet(res, 'id-cards', centreOf(u, c), list.length ? inArray(students.id, list) : eq(students.batchId, batchId!));
  }
}
