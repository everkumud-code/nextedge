import { cleanInput, discountFor, label, normCode, whyNot, type CouponRow } from '../src/platform/coupons';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };
const base: CouponRow = { code: 'DIWALI20', kind: 'percent', value: 20, plans: [], scope: 'first', validFrom: null, validTo: null, maxUses: null, usedCount: 0, active: true };
const ok = { plan: 'core', today: '2026-11-13', hasPaid: false };

// codes
eq([normCode(' diwali-20! '), normCode('a b'), normCode(null)], ['DIWALI-20', 'AB', ''], 'normCode');
// money
eq([discountFor(base, 10000), discountFor({ kind: 'percent', value: 100 }, 5000), discountFor({ kind: 'amount', value: 500 }, 10000), discountFor({ kind: 'amount', value: 500 }, 300), discountFor({ kind: 'percent', value: 33 }, 1000), discountFor(base, 0)], [2000, 5000, 500, 300, 330, 0], 'discountFor');
eq([label(base), label({ kind: 'amount', value: 500 })], ['20% off', 'Rs 500 off'], 'label');
// rules
eq(whyNot(base, ok), null, 'usable');
eq(whyNot({ ...base, active: false }, ok), 'This coupon is switched off.', 'off');
eq(whyNot({ ...base, validFrom: '2026-12-01' }, ok), 'This coupon starts on 2026-12-01.', 'not started');
eq(whyNot({ ...base, validTo: '2026-11-12' }, ok), 'This coupon has expired.', 'expired');
eq(whyNot({ ...base, validTo: '2026-11-13' }, ok), null, 'last day still works');
eq(whyNot({ ...base, maxUses: 5, usedCount: 5 }, ok)?.includes('maximum'), true, 'used up');
eq(whyNot({ ...base, maxUses: 5, usedCount: 4 }, ok), null, 'one use left');
eq(whyNot({ ...base, plans: ['pro', 'elite'] }, ok)?.includes('Edge Pro / Edge Elite'), true, 'wrong pack');
eq(whyNot({ ...base, plans: ['core'] }, ok), null, 'right pack');
eq(whyNot(base, { ...ok, hasPaid: true })?.includes('first payment'), true, 'first only');
eq(whyNot({ ...base, scope: 'every' }, { ...ok, hasPaid: true }), null, 'every invoice');
eq(whyNot(base, { ...ok, plan: 'demo' })?.includes('demo'), true, 'demo is free');
// the owner's form
eq((cleanInput({ code: 'ab', kind: 'percent', value: 10 }) as any).error?.includes('3'), true, 'short code');
eq((cleanInput({ code: 'abc', kind: 'percent', value: 101 }) as any).error?.includes('100'), true, '>100%');
eq((cleanInput({ code: 'abc', kind: 'amount', value: 10.5 }) as any).error?.includes('whole rupees'), true, 'paise');
eq((cleanInput({ code: 'abc', kind: 'amount', value: 0 }) as any).error?.includes('more than zero'), true, 'zero');
eq((cleanInput({ code: 'abc', kind: 'percent', value: 10, validFrom: '2026-12-31', validTo: '2026-01-01' }) as any).error?.includes('before'), true, 'dates reversed');
eq((cleanInput({ code: 'abc', kind: 'percent', value: 10, maxUses: 0 }) as any).error?.includes('Maximum uses'), true, 'maxUses 0');
const good = cleanInput({ code: ' new-year 25 ', title: ' Offer ', kind: 'amount', value: '500', plans: ['core', 'bogus'], scope: 'every', maxUses: '10', validTo: '2027-01-31' }) as any;
eq(good.ok && [good.ok.code, good.ok.title, good.ok.value, good.ok.plans, good.ok.scope, good.ok.maxUses, good.ok.validTo, good.ok.active], ['NEW-YEAR25', 'Offer', 500, ['core'], 'every', 10, '2027-01-31', true], 'clean values');
console.log(bad ? `${bad} FAILED` : 'coupons self-test: all passed'); process.exit(bad ? 1 : 0);
