import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres } from '../db/schema';
import { platformSmtp, sendEmailVia, Smtp } from '../integrations/email';

@Injectable()
export class MailService {
  constructor(private dbs: DbService) {}
  /** The centre's own mailbox if configured + verified, otherwise the platform mailbox. */
  async smtpFor(centreId: string | null): Promise<{ smtp: Smtp | null; own: boolean }> {
    if (centreId) {
      const [s] = await this.dbs.db.select().from(centreSettings).where(eq(centreSettings.centreId, centreId));
      if (s?.smtpHost && s.smtpUser && s.smtpPass) { const [c] = await this.dbs.db.select({ name: centres.name }).from(centres).where(eq(centres.id, centreId)); return { smtp: { host: s.smtpHost, port: s.smtpPort || 465, user: s.smtpUser, pass: s.smtpPass, from: s.smtpFrom || `${c?.name || 'Coaching'} <${s.smtpUser}>` }, own: true }; }
    }
    return { smtp: platformSmtp(), own: false };
  }
  async send(centreId: string | null, to: string, subject: string, text: string, html?: string) { const { smtp } = await this.smtpFor(centreId); return sendEmailVia(smtp, to, subject, text, html); }
}
