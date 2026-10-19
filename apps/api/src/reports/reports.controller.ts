import { Controller, Get, NotFoundException, Param, Query, Res, ForbiddenException } from '@nestjs/common';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { DbService } from '../db/db.service';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private dbs: DbService, private svc: ReportsService) {}
  /** JSON report (app) — ?month=YYYY-MM, default last month. */
  @Get('monthly/:studentId') async json(@CurrentUser() u: JwtUser, @Param('studentId') sid: string, @Query('month') month?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); await this.guard(u, centreId, sid); const r = await this.svc.monthly(centreId, sid, month || lastMonth()); if (!r) throw new NotFoundException(); return r;
  }
  /** PDF report (print / WhatsApp). */
  @Get('monthly/:studentId.pdf') async pdf(@CurrentUser() u: JwtUser, @Param('studentId') sid: string, @Res() res: any, @Query('month') month?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); await this.guard(u, centreId, sid); const r = await this.svc.monthly(centreId, sid, month || lastMonth()); if (!r) throw new NotFoundException();
    const pdf = await this.svc.monthlyPdf(r); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="report-${r.student.name.replace(/\s+/g, '_')}-${r.month}.pdf"`); res.end(pdf);
  }
  private async guard(u: JwtUser, centreId: string, sid: string) { if (['SUPER_ADMIN', 'ADMIN', 'FACULTY'].includes(u.role)) return; const mine = await myStudents(this.dbs.db, u, centreId); if (!mine.find((s) => s.id === sid)) throw new ForbiddenException(); }
}
const lastMonth = () => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 7); };
