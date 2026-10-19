// Email adapter. Prefers an HTTP API (works on hosts that block SMTP, e.g. Render free): BREVO_API_KEY (free 300/day) or RESEND_API_KEY.
// Falls back to SMTP (SMTP_HOST/USER/PASS) with a short timeout. Nothing configured → logs the mail (dev).
import nodemailer from 'nodemailer';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Coaching Connect';
const FROM_ADDR = () => process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com';
export const emailReady = () => !!(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  const body = html || `<p style="font-family:sans-serif;font-size:15px">${text.replace(/\n/g, '<br>')}</p>`;
  if (process.env.BREVO_API_KEY) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ sender: { name: FROM_NAME, email: FROM_ADDR() }, to: [{ email: to }], subject, textContent: text, htmlContent: body }) });
    if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`); return true;
  }
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ from: `${FROM_NAME} <${FROM_ADDR()}>`, to: [to], subject, text, html: body }) });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`); return true;
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000 });
    await t.sendMail({ from: process.env.SMTP_FROM || `${FROM_NAME} <${FROM_ADDR()}>`, to, subject, text, html: body }); return true;
  }
  console.log(`[email:dev] to ${to}: ${subject} — ${text}`); return false;
}
