// Own-mail-server email: every centre sends from its own mailbox; the platform sends from the BoomBites mailbox (PLATFORM_SMTP_*).
// No third-party email API. SMTP needs outbound ports 465/587 (open on a normal VPS).
import nodemailer from 'nodemailer';
export type Smtp = { host: string; port: number; user: string; pass: string; from?: string | null };

export const platformSmtp = (): Smtp | null => (process.env.PLATFORM_SMTP_HOST && process.env.PLATFORM_SMTP_USER && process.env.PLATFORM_SMTP_PASS)
  ? { host: process.env.PLATFORM_SMTP_HOST, port: Number(process.env.PLATFORM_SMTP_PORT || 465), user: process.env.PLATFORM_SMTP_USER, pass: process.env.PLATFORM_SMTP_PASS, from: process.env.PLATFORM_SMTP_FROM || `NextEdge <${process.env.PLATFORM_SMTP_USER}>` } : null;

/** Common presets so an owner only picks the provider and types email + password. */
export const SMTP_PRESETS: Record<string, { host: string; port: number; note: string }> = {
  gmail: { host: 'smtp.gmail.com', port: 465, note: 'Use a Google App Password (2-Step Verification → App passwords), not your normal password.' },
  hostinger: { host: 'smtp.hostinger.com', port: 465, note: 'Your Hostinger mailbox password.' },
  zoho: { host: 'smtp.zoho.in', port: 465, note: 'Zoho Mail password or app password.' },
  outlook: { host: 'smtp.office365.com', port: 587, note: 'Microsoft 365 / Outlook password (SMTP AUTH must be enabled).' },
  yahoo: { host: 'smtp.mail.yahoo.com', port: 465, note: 'Yahoo app password.' },
  rediff: { host: 'smtp.rediffmailpro.com', port: 465, note: 'Rediffmail Pro password.' },
  custom: { host: '', port: 465, note: 'Ask your email provider for the SMTP host and port.' },
};

export async function sendEmailVia(smtp: Smtp | null, to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!smtp) { console.log(`[email:dev] to ${to}: ${subject} — ${text}`); return false; }
  const t = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000 });
  await t.sendMail({ from: smtp.from || smtp.user, to, subject, text, html: html || `<p style="font-family:sans-serif;font-size:15px">${text.replace(/\n/g, '<br>')}</p>` });
  return true;
}
/** Verifies credentials by opening a connection (used by the Settings "Test" button). */
export async function verifySmtp(smtp: Smtp): Promise<void> {
  const t = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass }, connectionTimeout: 8000, greetingTimeout: 8000 });
  await t.verify();
}
export const emailReady = () => !!platformSmtp();
export const sendEmail = (to: string, subject: string, text: string, html?: string) => sendEmailVia(platformSmtp(), to, subject, text, html);
