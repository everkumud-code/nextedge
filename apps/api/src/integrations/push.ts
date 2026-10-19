// Firebase Cloud Messaging via HTTP v1 using a service account (FIREBASE_SERVICE_ACCOUNT_JSON env). Returns false when not configured.
import { createSign } from 'crypto';
let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string | null> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON; if (!raw) return null;
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = JSON.parse(raw); const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}` });
  const j: any = await res.json(); cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return cached.token;
}
export async function sendPush(deviceToken: string, title: string, body: string, data: Record<string, string> = {}): Promise<boolean> {
  const tok = await accessToken(); if (!tok) return false;
  const project = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!).project_id;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { token: deviceToken, notification: { title, body }, data } }) });
  if (!res.ok) throw new Error(`FCM ${res.status}: ${await res.text()}`);
  return true;
}
