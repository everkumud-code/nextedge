import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { deviceTokens, notificationLog, students, users } from '../db/schema';
import { sendPush } from '../integrations/push';
import { sendWhatsApp } from '../integrations/whatsapp';
import { MailService } from './mail.service';

const QUIET = (h: number) => h >= 22 || h < 7; // IST quiet hours 10pm-7am

@Injectable()
export class NotificationsService {
  private log = new Logger('Notify');
  constructor(private dbs: DbService, private mail: MailService) {}

  /** Push first; WhatsApp template fallback when the user has no device token. Urgent bypasses quiet hours. Fire-and-forget. */
  notifyUsers(centreId: string, userIds: string[], title: string, body: string, opts: { urgent?: boolean; waTemplate?: string; data?: Record<string, string> } = {}) {
    if (!userIds.length) return;
    setImmediate(() => this.run(centreId, [...new Set(userIds)], title, body, opts).catch((e) => this.log.error(e)));
  }

  /** Everyone attached to a batch: students' logins and their parents. batchId null = whole centre. */
  async audienceForBatch(centreId: string, batchId: string | null, roles: ('STUDENT' | 'PARENT')[] = ['STUDENT', 'PARENT']) {
    const where = batchId ? and(eq(students.centreId, centreId), eq(students.batchId, batchId), eq(students.active, true)) : and(eq(students.centreId, centreId), eq(students.active, true));
    const rows = await this.dbs.db.select({ userId: students.userId, parentMobile: students.parentMobile }).from(students).where(where);
    const ids: string[] = [];
    if (roles.includes('STUDENT')) ids.push(...rows.map((r) => r.userId).filter((x): x is string => !!x));
    if (roles.includes('PARENT') && rows.length) {
      const parents = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'PARENT'), inArray(users.mobile, rows.map((r) => r.parentMobile))));
      ids.push(...parents.map((p) => p.id));
    }
    return ids;
  }

  private async run(centreId: string, userIds: string[], title: string, body: string, opts: { urgent?: boolean; waTemplate?: string; data?: Record<string, string> }) {
    const db = this.dbs.db;
    const istHour = (new Date().getUTCHours() + 5.5) % 24;
    const data = opts.data ? JSON.stringify(opts.data) : null;
    if (!opts.urgent && QUIET(istHour)) { await db.insert(notificationLog).values(userIds.map((userId) => ({ centreId, userId, channel: 'inapp', title, body, status: 'sent', error: 'push skipped: quiet hours', data }))); return; }
    const toks = await db.select().from(deviceTokens).where(inArray(deviceTokens.userId, userIds));
    const people = await db.select({ id: users.id, mobile: users.mobile, email: users.email }).from(users).where(inArray(users.id, userIds));
    for (const p of people) {
      const mine = toks.filter((t) => t.userId === p.id);
      let status = 'skipped', channel = 'push', error: string | undefined;
      try {
        if (mine.length) { const ok = await Promise.all(mine.map((t) => sendPush(t.token, title, body, opts.data))); status = ok.some(Boolean) ? 'sent' : 'skipped'; if (status === 'skipped') error = 'FCM not configured'; }
        if (status !== 'sent') { channel = 'whatsapp'; const ok = await sendWhatsApp(p.mobile, opts.waTemplate || process.env.WA_TEMPLATE_NOTICE || 'cc_notice', [title, body]); status = ok ? 'sent' : 'skipped'; if (!ok) error = error ? error + '; WhatsApp not configured' : 'WhatsApp not configured'; }
        if (status !== 'sent' && p.email) { channel = 'email'; try { const ok = await this.mail.send(centreId, p.email, title, body); status = ok ? 'sent' : 'skipped'; } catch (e: any) { error = (error ? error + '; ' : '') + 'email: ' + e.message; } }
      } catch (e: any) { status = 'failed'; error = e.message; }
      // The in-app feed always gets it; channel/status say whether push or WhatsApp also went out.
      await db.insert(notificationLog).values({ centreId, userId: p.id, channel: status === 'sent' ? channel : 'inapp', title, body, status: status === 'sent' ? 'sent' : 'sent', error, data });
    }
  }
}
