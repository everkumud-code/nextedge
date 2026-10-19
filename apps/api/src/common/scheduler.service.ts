import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres, users } from '../db/schema';
import { ReportsService } from '../reports/reports.service';
import { FeesController } from '../fees/fees.controller';
import { WishesController } from '../wishes/wishes.controller';
import { PlatformService } from '../platform/platform.service';

/** In-process daily jobs at 09:00 IST: fee reminders (every day for balances > 0 on days 1, 7, 15, 25) and monthly reports on the 1st. Single instance only; move to BullMQ when scaling out. */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private log = new Logger('Scheduler'); private lastRun = ''; private lastWish = '';
  constructor(private dbs: DbService, private reports: ReportsService, private fees: FeesController, private wishes: WishesController, private platform: PlatformService) {}
  onModuleInit() { if (process.env.SCHEDULER !== 'off') setInterval(() => this.tick().catch((e) => this.log.error(e)), 5 * 60_000).unref(); }
  async tick() {
    const ist = new Date(Date.now() + 5.5 * 3600e3); const day = ist.toISOString().slice(0, 10);
    if (ist.getUTCHours() === 7 && this.lastWish !== day) { this.lastWish = day; const n = await this.wishes.sendBirthdayWishes(); this.log.log(`Birthday wishes sent: ${n}`); }
    if (ist.getUTCHours() !== 9 || this.lastRun === day) return; this.lastRun = day;
    await this.platform.renewalSweep();
    const dom = ist.getUTCDate();
    if (dom === 1) await this.reports.sendMonthlyReports();
    if ([1, 7, 15, 25].includes(dom)) { const all = await this.dbs.db.select({ id: centres.id }).from(centres);
      for (const c of all) { const [admin] = await this.dbs.db.select().from(users).where(eq(users.centreId, c.id)); if (!admin) continue;
        const r = await this.fees.remind({ id: admin.id, role: 'ADMIN', centreId: c.id, name: 'scheduler' }, undefined); this.log.log(`Centre ${c.id}: fee reminders ${r.reminded}`); } }
  }
}
