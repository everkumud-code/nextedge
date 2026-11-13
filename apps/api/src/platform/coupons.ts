/**
 * Coupon rules for NextEdge subscriptions (pure functions, no database, so they can be self-tested).
 * A coupon takes a percentage or a flat rupee amount off the invoice of a client (school / coaching).
 * It can be limited to some packs, to the first payment only, to a date range and to a number of uses.
 */
export type CouponKind = 'percent' | 'amount';
export type CouponScope = 'first' | 'every';
export type CouponRow = { code: string; kind: CouponKind; value: number; plans: string[]; scope: CouponScope; validFrom: string | null; validTo: string | null; maxUses: number | null; usedCount: number; active: boolean };

export const PACKS = ['core', 'pro', 'elite'] as const;
export const normCode = (s: any) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
const isDate = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Checks what the owner typed in the "new coupon" form. Returns an error text, or the clean values. */
export function cleanInput(b: any): { error: string } | { ok: { code: string; title: string; kind: CouponKind; value: number; plans: string[]; scope: CouponScope; validFrom: string | null; validTo: string | null; maxUses: number | null; active: boolean } } {
  const code = normCode(b?.code); if (code.length < 3) return { error: 'The coupon code must have at least 3 letters or numbers (A-Z, 0-9).' };
  const kind = b?.kind === 'amount' ? 'amount' : b?.kind === 'percent' ? 'percent' : null; if (!kind) return { error: 'Choose a percentage or a flat amount.' };
  const value = Number(b?.value); if (!(value > 0)) return { error: 'The discount must be more than zero.' };
  if (kind === 'percent' && value > 100) return { error: 'A percentage discount cannot be more than 100.' };
  if (kind === 'amount' && !Number.isInteger(value)) return { error: 'The flat amount must be in whole rupees.' };
  const plans = Array.isArray(b?.plans) ? b.plans.filter((p: any) => (PACKS as readonly string[]).includes(p)) : []; // empty = every pack
  const scope: CouponScope = b?.scope === 'every' ? 'every' : 'first';
  const validFrom = b?.validFrom ? String(b.validFrom) : null; const validTo = b?.validTo ? String(b.validTo) : null;
  if ((validFrom && !isDate(validFrom)) || (validTo && !isDate(validTo))) return { error: 'Dates must look like 2026-12-31.' };
  if (validFrom && validTo && validTo < validFrom) return { error: 'The last date is before the first date.' };
  const maxUses = b?.maxUses === '' || b?.maxUses == null ? null : Number(b.maxUses); if (maxUses !== null && !(Number.isInteger(maxUses) && maxUses > 0)) return { error: 'Maximum uses must be a whole number above zero (or leave it empty for no limit).' };
  return { ok: { code, title: String(b?.title ?? '').trim().slice(0, 80), kind, value, plans, scope, validFrom, validTo, maxUses, active: b?.active !== false } };
}

/** Why this coupon cannot be used now, or null when it can. `plan` is the client's pack, `hasPaid` whether the client has paid any invoice before. */
export function whyNot(c: CouponRow, ctx: { plan: string; today: string; hasPaid: boolean }): string | null {
  if (!c.active) return 'This coupon is switched off.';
  if (c.validFrom && ctx.today < c.validFrom) return `This coupon starts on ${c.validFrom}.`;
  if (c.validTo && ctx.today > c.validTo) return 'This coupon has expired.';
  if (c.maxUses !== null && c.usedCount >= c.maxUses) return 'This coupon has already been used the maximum number of times.';
  if (ctx.plan === 'demo') return 'The demo package is free; coupons are for paid packs.';
  if (c.plans.length && !c.plans.includes(ctx.plan)) return `This coupon is only for ${c.plans.map((p) => 'Edge ' + p[0].toUpperCase() + p.slice(1)).join(' / ')}.`;
  if (c.scope === 'first' && ctx.hasPaid) return 'This coupon is for the first payment only, and this client has already paid.';
  return null;
}

/** Rupees taken off an invoice of `amount` (whole rupees, never more than the invoice). */
export function discountFor(c: Pick<CouponRow, 'kind' | 'value'>, amount: number): number {
  const a = Math.max(0, Math.round(amount)); const d = c.kind === 'percent' ? Math.round((a * c.value) / 100) : Math.round(c.value);
  return Math.min(a, Math.max(0, d));
}

export const label = (c: Pick<CouponRow, 'kind' | 'value'>) => (c.kind === 'percent' ? `${c.value}% off` : `Rs ${c.value} off`);
