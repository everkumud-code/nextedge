import { createHash, randomInt } from 'crypto';

/**
 * A "parent login code": the school office gives a parent a 6-digit code (on WhatsApp, on the admission receipt, over the phone).
 * The parent signs in with the mobile number the school has on record plus this code, so login never depends on an SMS or
 * WhatsApp provider. Safe by design: the code is kept only as a hash, lasts 24 hours, works once, and is locked after 5 wrong tries.
 */
export type KV = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  hit(key: string, windowSec: number): Promise<number>;
};

export const PARENT_CODE_TTL_SEC = 24 * 3600;
export const PARENT_CODE_FAIL_LIMIT = 5;

const hash = (centreId: string, mobile: string, code: string) => createHash('sha256').update(`parent-code:${centreId}:${mobile}:${code}`).digest('hex');
const codeKey = (centreId: string, mobile: string) => `pcode:${centreId}:${mobile}`;
const failKey = (centreId: string, mobile: string) => `pcode:fails:${centreId}:${mobile}`;

export const cleanMobile = (value: unknown) => String(value ?? '').replace(/\D/g, '').slice(-10);

/** A fresh code for this parent. An older unused code stops working. Returns the code (it is shown once, never stored). */
export async function issueParentCode(kv: KV, centreId: string, mobile: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await kv.set(codeKey(centreId, mobile), hash(centreId, mobile, code), PARENT_CODE_TTL_SEC);
  await kv.del(failKey(centreId, mobile));
  return code;
}

/** Checks a code. A right code is used up at once; 5 wrong tries kill the code so it cannot be guessed. */
export async function checkParentCode(kv: KV, centreId: string, mobile: string, code: string): Promise<'ok' | 'wrong' | 'expired' | 'locked'> {
  if (!/^\d{6}$/.test(code)) return 'wrong';
  const stored = await kv.get(codeKey(centreId, mobile));
  if (!stored) return 'expired';
  if (stored !== hash(centreId, mobile, code)) {
    const fails = await kv.hit(failKey(centreId, mobile), PARENT_CODE_TTL_SEC);
    if (fails >= PARENT_CODE_FAIL_LIMIT) { await kv.del(codeKey(centreId, mobile)); return 'locked'; }
    return 'wrong';
  }
  await kv.del(codeKey(centreId, mobile)); await kv.del(failKey(centreId, mobile));
  return 'ok';
}

/** The message the office can send to a parent (WhatsApp or SMS by hand). */
export function parentCodeMessage(school: string, link: string, mobile: string, code: string): string {
  return `${school}: your parent login. Open ${link} and sign in with mobile ${mobile} and the code ${code}. The code works once and lasts 24 hours. Please do not share it.`;
}
