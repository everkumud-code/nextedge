import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, platformSettings } from '../db/schema';
import { platformSmtp, sendEmailVia, Smtp } from '../integrations/email';

@Injectable()
export class MailService {
  private cache: { at: number; row: any } | null = null;
  constructor(private dbs: DbService) {}
  /** Platform settings row (super-admin mailbox + OTP switch), cached 30 s. */
  async platform() {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.row;
    let [row] = await this.dbs.db.select().from(platformSettings).where(eq(platformSettings.id, 'platform'));
    if (!row) { await this.dbs.db.insert(platformSettings).values({ id: 'platform' }).onConflictDoNothing(); [row] = await this.dbs.db.select().from(platformSettings).where(eq(platformSettings.id, 'platform')); }
    this.cache = { at: Date.now(), row }; return row;
  }
  invalidate() { this.cache = null; }
  /** The BoomBites mailbox: DB (set from the Platform page) first, env PLATFORM_SMTP_* as fallback. */
  async platformMailbox(): Promise<Smtp | null> {
    const p = await this.platform();
    if (p?.smtpHost && p.smtpUser && p.smtpPass) return { host: p.smtpHost, port: p.smtpPort || 465, user: p.smtpUser, pass: p.smtpPass, from: p.smtpFrom || `NextEdge <${p.smtpUser}>` };
    return platformSmtp();
  }
  async otpEnabled(): Promise<boolean> { const m = (process.env.OTP_MODE || '').trim(); if (m === 'none') return false; if (m === 'dev' || m === 'live') return true; return !!(await this.platform())?.otpEnabled; }
  /** The centre's own mailbox if configured + verified, otherwise the platform mailbox. */
  async smtpFor(centreId: string | null): Promise<{ smtp: Smtp | null; own: boolean }> {
    if (centreId) {
      const [s] = await this.dbs.db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId));
      if (s?.smtpHost && s.smtpUser && s.smtpPass) { const [c] = await this.dbs.db.select({ name: centres.name }).from(centres).where(eq(centres.id, centreId)); return { smtp: { host: s.smtpHost, port: s.smtpPort || 465, user: s.smtpUser, pass: s.smtpPass, from: s.smtpFrom || `${c?.name || 'Coaching'} <${s.smtpUser}>` }, own: true }; }
    }
    return { smtp: await this.platformMailbox(), own: false };
  }
  async send(centreId: string | null, to: string, subject: string, text: string, html?: string) { const { smtp } = await this.smtpFor(centreId); return sendEmailVia(smtp, to, subject, text, html); }
}
