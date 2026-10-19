// Email via SMTP (free with a Gmail account + App Password, or any SMTP). Env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
import nodemailer from 'nodemailer';
export const emailReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  if (!emailReady()) { console.log(`[email:dev] to ${to}: ${subject} — ${text}`); return false; }
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text, html: html || `<p>${text}</p>` });
  return true;
}
