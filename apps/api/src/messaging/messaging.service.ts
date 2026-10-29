import { OnModuleInit, BadRequestException } from '@nestjs/common';
import { setPushKey, pushKeySource, verifyPushKey } from '../integrations/push';
import { Injectable, Logger } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, messageLog, platformSettings } from '../db/schema';
import { MailService } from '../notifications/mail.service';
import { sendWhatsApp as legacyWhatsApp } from '../integrations/whatsapp';
import { Kind, SMS_PROVIDERS, SmsCfg, Vars, WA_PROVIDERS, WaCfg, smsReady, smsVia, waReady, waVia } from './providers';

export type Source = 'centre' | 'platform' | 'env' | null;
export type Result = { sent: boolean; reason?: string; provider?: string };
const SECRET = ['apiKey', 'authToken', 'token'] as const; const MASK = '••••';
const mask = (v?: string) => (v ? MASK + (v.length > 8 ? v.slice(-4) : '') : '');
const maskedTo = (m: string) => (m.includes('@') ? m.replace(/^(.{2}).*(@.*)$/, '$1***$2') : `******${String(m).replace(/\D/g, '').slice(-4)}`);
const clean = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => o?.[k] !== undefined).map((k) => [k, typeof o[k] === 'string' ? o[k].trim() : o[k]]));

/** One place that sends SMS / WhatsApp / email for OTPs, notices and reminders, using the centre's own account if it has one, else the platform's, else the server's environment. Never throws; always logs. */
@Injectable()
export class MessagingService implements OnModuleInit {
  private log = new Logger('Messaging');
  constructor(private dbs: DbService, private mail: MailService) {}
  async onModuleInit() { try { const [p] = await this.dbs.db.select({ k: platformSettings.firebaseJson }).from(platformSettings).where(eq(platformSettings.id, 'platform')); setPushKey(p?.k || null); } catch { /* table not ready yet: env key still works */ } }
  async pushStatus() { let info: any = null; const src = pushKeySource(); if (src) { try { const raw = src === 'platform' ? (await this.dbs.db.select({ k: platformSettings.firebaseJson }).from(platformSettings).where(eq(platformSettings.id, 'platform')))[0]?.k : process.env.FIREBASE_SERVICE_ACCOUNT_JSON; const sa = JSON.parse(raw || '{}'); info = { projectId: sa.project_id, clientEmail: sa.client_email }; } catch { info = null; } } return { configured: !!src, source: src, ...info }; }
  async setPushKey(raw: string | null) { if (raw === null) { await this.mail.platform(); await this.dbs.db.update(platformSettings).set({ firebaseJson: null, updatedAt: new Date() }).where(eq(platformSettings.id, 'platform')); setPushKey(null); return this.pushStatus(); } const info = await verifyPushKey(raw).catch((e) => { throw new BadRequestException(e.message); }); await this.mail.platform(); await this.dbs.db.update(platformSettings).set({ firebaseJson: raw, updatedAt: new Date() }).where(eq(platformSettings.id, 'platform')); setPushKey(raw); return { configured: true, source: 'platform', ...info }; }
  private parse(s?: string | null) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
  async platformCfg(): Promise<{ sms?: SmsCfg; whatsapp?: WaCfg }> { const p = await this.mail.platform(); return this.parse(p?.channels); }
  async centreCfg(centreId?: string | null): Promise<{ sms?: SmsCfg; whatsapp?: WaCfg }> { if (!centreId) return {}; const [s] = await this.dbs.db.select({ c: centreSettings.channels }).from(centreSettings).where(eq(centreSettings.centreId, centreId)); return this.parse(s?.c); }

  /** The account to use for each channel, and where it came from. */
  async resolve(centreId?: string | null) {
    const own = await this.centreCfg(centreId); const plat = await this.platformCfg();
    const envSms: SmsCfg | null = process.env.MSG91_AUTH_KEY ? { provider: 'msg91', apiKey: process.env.MSG91_AUTH_KEY, templates: { otp: process.env.MSG91_TEMPLATE_ID, notice: process.env.MSG91_NOTICE_TEMPLATE_ID }, smsFor: 'urgent' } : null;
    const envWa: WaCfg | null = process.env.WA_API_URL && process.env.WA_API_KEY ? { provider: 'legacy', templates: { notice: process.env.WA_TEMPLATE_NOTICE || 'cc_notice' } } : null;
    const pick = <T,>(a: T | undefined, ready: (c: any) => string | null, b: T | undefined, c: T | null): { cfg: T | null; source: Source } => (a && !ready(a) ? { cfg: a, source: 'centre' } : b && !ready(b) ? { cfg: b, source: 'platform' } : c ? { cfg: c, source: 'env' } : { cfg: null, source: null });
    const sms = pick<SmsCfg>(own.sms, smsReady, plat.sms, envSms); const wa = pick<WaCfg>(own.whatsapp, waReady, plat.whatsapp, envWa);
    return { sms: sms.cfg, whatsapp: wa.cfg, source: { sms: sms.source, whatsapp: wa.source } };
  }
  async smsPolicy(centreId?: string | null): Promise<'urgent' | 'all' | 'none'> { const r = await this.resolve(centreId); return r.sms?.smsFor || 'urgent'; }

  private async record(centreId: string | null | undefined, channel: string, kind: string, to: string, status: string, provider?: string, error?: string, ref?: string) {
    await this.dbs.db.insert(messageLog).values({ centreId: centreId || null, channel, kind, toMasked: maskedTo(to), provider, status, error: error?.slice(0, 300), ref }).catch(() => {});
  }
  async sendSms(centreId: string | null | undefined, mobile: string, kind: Kind, v: Vars): Promise<Result> {
    if ((process.env.OTP_MODE || '').trim() === 'dev') { console.log(`[sms:dev] ${mobile}: ${v.text}`); return { sent: true, provider: 'dev' }; }
    const r = await this.resolve(centreId); if (!r.sms) { await this.record(centreId, 'sms', kind, mobile, 'skipped', undefined, 'SMS is not set up'); return { sent: false, reason: 'SMS is not set up' }; }
    try { const out = await smsVia(r.sms, mobile, kind, v); await this.record(centreId, 'sms', kind, mobile, 'sent', r.sms.provider, undefined, out.ref); return { sent: true, provider: r.sms.provider }; }
    catch (e: any) { this.log.warn(`SMS failed: ${e.message}`); await this.record(centreId, 'sms', kind, mobile, 'failed', r.sms.provider, e.message); return { sent: false, reason: e.message, provider: r.sms.provider }; }
  }
  async sendWhatsApp(centreId: string | null | undefined, mobile: string, kind: Kind, v: Vars): Promise<Result> {
    if ((process.env.OTP_MODE || '').trim() === 'dev') { console.log(`[wa:dev] ${mobile}: ${v.text}`); return { sent: true, provider: 'dev' }; }
    const r = await this.resolve(centreId); if (!r.whatsapp) { await this.record(centreId, 'whatsapp', kind, mobile, 'skipped', undefined, 'WhatsApp is not set up'); return { sent: false, reason: 'WhatsApp is not set up' }; }
    try { const out = await waVia(r.whatsapp, mobile, kind, v, legacyWhatsApp); await this.record(centreId, 'whatsapp', kind, mobile, 'sent', r.whatsapp.provider, undefined, out.ref); return { sent: true, provider: r.whatsapp.provider }; }
    catch (e: any) { this.log.warn(`WhatsApp failed: ${e.message}`); await this.record(centreId, 'whatsapp', kind, mobile, 'failed', r.whatsapp.provider, e.message); return { sent: false, reason: e.message, provider: r.whatsapp.provider }; }
  }
  async sendEmail(centreId: string | null | undefined, to: string, subject: string, text: string, kind: Kind | 'admission' = 'notice'): Promise<Result> {
    try { const ok = await this.mail.send(centreId || null, to, subject, text); await this.record(centreId, 'email', kind, to, ok ? 'sent' : 'skipped', 'smtp', ok ? undefined : 'No mailbox is set up'); return ok ? { sent: true, provider: 'smtp' } : { sent: false, reason: 'No mailbox is set up' }; }
    catch (e: any) { await this.record(centreId, 'email', kind, to, 'failed', 'smtp', e.message); return { sent: false, reason: e.message }; }
  }

  /** Reach someone who is not a user yet (an applicant's parent): WhatsApp, then SMS (unless the centre turned SMS off), then email. */
  async contact(centreId: string, who: { mobile?: string; email?: string }, title: string, body: string, kind: Kind | 'admission' = 'notice'): Promise<Result & { via?: string }> {
    const v: Vars = { title, body, text: `${title}: ${body}`.slice(0, 300) }; const k: Kind = kind === 'admission' ? 'notice' : kind;
    if (who.mobile) { const w = await this.sendWhatsApp(centreId, who.mobile, k, v); if (w.sent) return { ...w, via: 'whatsapp' }; if ((await this.smsPolicy(centreId)) !== 'none') { const m = await this.sendSms(centreId, who.mobile, k, v); if (m.sent) return { ...m, via: 'sms' }; } }
    if (who.email) { const e = await this.sendEmail(centreId, who.email, title, body, k); if (e.sent) return { ...e, via: 'email' }; return e; }
    return { sent: false, reason: 'No channel could reach this person' };
  }

  /** What is connected for a centre (or the platform when centreId is null). */
  async status(centreId?: string | null) {
    const r = await this.resolve(centreId); const smtp = await this.mail.smtpFor(centreId || null);
    return { otpEnabled: await this.mail.otpEnabled(), sms: { ready: !!r.sms, provider: r.sms?.provider || null, source: r.source.sms, smsFor: r.sms?.smsFor || 'urgent' }, whatsapp: { ready: !!r.whatsapp, provider: r.whatsapp?.provider || null, source: r.source.whatsapp }, email: { ready: !!smtp.smtp, source: smtp.smtp ? (smtp.own ? 'centre' : 'platform') : null, from: smtp.smtp?.from || null }, push: { ready: !!(process.env.FCM_SERVICE_ACCOUNT || process.env.FCM_PROJECT_ID || process.env.FIREBASE_SERVICE_ACCOUNT) } };
  }

  /** Stored settings of one scope with secrets masked. */
  async getConfig(centreId: string | null) {
    const c = centreId ? await this.centreCfg(centreId) : await this.platformCfg(); const out: any = {};
    for (const ch of ['sms', 'whatsapp'] as const) { const v: any = (c as any)[ch]; if (!v) continue; out[ch] = { ...v }; for (const k of SECRET) if (v[k]) out[ch][k] = mask(v[k]); }
    return { sms: out.sms || null, whatsapp: out.whatsapp || null, providers: { sms: SMS_PROVIDERS, whatsapp: WA_PROVIDERS } };
  }
  async setConfig(centreId: string | null, body: { sms?: any; whatsapp?: any }) {
    const cur: any = centreId ? await this.centreCfg(centreId) : await this.platformCfg(); const next: any = { ...cur };
    for (const ch of ['sms', 'whatsapp'] as const) {
      if (!(ch in body)) continue; const inc = (body as any)[ch]; if (inc === null) { delete next[ch]; continue; }
      const provs: readonly string[] = ch === 'sms' ? SMS_PROVIDERS : WA_PROVIDERS; if (inc.provider && !provs.includes(inc.provider)) throw new Error(`Unknown ${ch} provider "${inc.provider}"`);
      const keys = ch === 'sms' ? ['provider', 'apiKey', 'senderId', 'accountSid', 'authToken', 'from', 'webhookUrl', 'baseUrl', 'smsFor'] : ['provider', 'token', 'phoneId', 'webhookUrl', 'baseUrl', 'lang', 'otpButton'];
      const v: any = { ...(cur[ch] || {}), ...clean(inc, keys) }; for (const k of SECRET) if (typeof inc[k] === 'string' && inc[k].startsWith(MASK)) v[k] = (cur[ch] || {})[k]; // masked value sent back = keep what is stored
      if (inc.templates) v.templates = { ...(cur[ch]?.templates || {}), ...clean(inc.templates, ['otp', 'notice']) }; if (v.smsFor && !['urgent', 'all', 'none'].includes(v.smsFor)) throw new Error('SMS policy must be urgent, all or none');
      next[ch] = v;
    }
    const json = JSON.stringify(next);
    if (centreId) await this.dbs.db.update(centreSettings).set({ channels: json }).where(eq(centreSettings.centreId, centreId)); else { await this.mail.platform(); await this.dbs.db.update(platformSettings).set({ channels: json, updatedAt: new Date() }).where(eq(platformSettings.id, 'platform')); this.mail.invalidate(); }
    return this.getConfig(centreId);
  }

  async test(centreId: string | null, channel: 'sms' | 'whatsapp' | 'email', to: string): Promise<Result> {
    const text = 'NextEdge test message: this channel is connected.'; const v: Vars = { text, title: 'NextEdge test', body: 'This channel is connected.', code: '482913' };
    if (channel === 'email') return this.sendEmail(centreId, to, 'NextEdge test message', text, 'test'); const kind: Kind = 'test';
    // Providers with approved templates only deliver template text, so the test uses the notification template.
    return channel === 'sms' ? this.sendSms(centreId, to, kind, v) : this.sendWhatsApp(centreId, to, kind, v);
  }
  async logs(centreId: string | null, channel?: string, status?: string) {
    const cond = [centreId ? eq(messageLog.centreId, centreId) : undefined, channel ? eq(messageLog.channel, channel) : undefined, status ? eq(messageLog.status, status) : undefined].filter(Boolean) as any[];
    return this.dbs.db.select().from(messageLog).where(cond.length ? and(...cond) : undefined).orderBy(desc(messageLog.at)).limit(200);
  }
}
