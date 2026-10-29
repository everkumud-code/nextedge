// Firebase Cloud Messaging via HTTP v1 using a service account (FIREBASE_SERVICE_ACCOUNT_JSON env). Returns false when not configured.
import { createSign } from 'crypto';
let cached: { token: string; exp: number } | null = null; let stored: string | null = null;
/** The key pasted on the Messaging page (kept in the database); falls back to the FIREBASE_SERVICE_ACCOUNT_JSON env var. */
export function setPushKey(raw: string | null) { stored = raw; cached = null; }
export const pushKeySource = (): 'platform' | 'env' | null => (stored ? 'platform' : process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? 'env' : null);
const keyJson = () => stored || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || null;
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token'; const FCM_URL = () => process.env.FCM_BASE_URL || 'https://fcm.googleapis.com';
/** Checks a service-account key by asking Google for a token. Throws a readable message when it does not work. */
export async function verifyPushKey(raw: string): Promise<{ projectId: string; clientEmail: string }> {
  let sa: any; try { sa = JSON.parse(raw); } catch { throw new Error('This is not valid JSON. Paste the whole file you downloaded from Firebase.'); }
  if (sa.type !== 'service_account' || !sa.client_email || !sa.private_key || !sa.project_id) throw new Error('This does not look like a Firebase service-account key (it needs type, project_id, client_email and private_key).');
  const t = await mint(sa).catch((e) => { throw new Error(`The private key could not be used: ${String(e.message || e).slice(0, 80)}`); }); if (!t) throw new Error('Google did not accept this key. Download a fresh one from Firebase → Project settings → Service accounts.');
  return { projectId: sa.project_id, clientEmail: sa.client_email };
}
async function mint(sa: any): Promise<{ access_token: string; expires_in: number } | null> {
  const now = Math.floor(Date.now() / 1000); const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: TOKEN_URL(), iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const res = await fetch(TOKEN_URL(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}` });
  const j: any = await res.json().catch(() => ({})); return res.ok && j.access_token ? j : null;
}
async function accessToken(): Promise<string | null> {
  const raw = keyJson(); if (!raw) return null;
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const j = await mint(JSON.parse(raw)); if (!j) throw new Error('Google did not give a push token (check the Firebase key)'); cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return cached.token;
}
export async function sendPush(deviceToken: string, title: string, body: string, data: Record<string, string> = {}): Promise<boolean> {
  const tok = await accessToken(); if (!tok) return false;
  const project = JSON.parse(keyJson()!).project_id;
  const res = await fetch(`${FCM_URL()}/v1/projects/${project}/messages:send`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { token: deviceToken, notification: { title, body }, data } }) });
  if (!res.ok) throw new Error(`FCM ${res.status}: ${await res.text()}`);
  return true;
}
