// PayU India hosted checkout: we return the form fields + hash, the browser posts them to PayU, PayU posts back to our callback.
import { createHash } from 'crypto';
export type PayuCfg = { key: string; salt: string; test: boolean };
export const payuUrl = (test: boolean) => (test ? 'https://test.payu.in/_payment' : 'https://secure.payu.in/_payment');
export function payuForm(cfg: PayuCfg, p: { txnid: string; amount: number; productinfo: string; firstname: string; email: string; phone: string; surl: string; furl: string; udf1?: string; udf2?: string }) {
  const amount = p.amount.toFixed(2); const udf1 = p.udf1 || '', udf2 = p.udf2 || '';
  const hash = createHash('sha512').update(`${cfg.key}|${p.txnid}|${amount}|${p.productinfo}|${p.firstname}|${p.email}|${udf1}|${udf2}|||||||||${cfg.salt}`).digest('hex');
  return { action: payuUrl(cfg.test), fields: { key: cfg.key, txnid: p.txnid, amount, productinfo: p.productinfo, firstname: p.firstname, email: p.email, phone: p.phone, surl: p.surl, furl: p.furl, udf1, udf2, hash } };
}
/** Verifies PayU's response hash (reverse order). */
export function payuVerify(cfg: PayuCfg, r: Record<string, string>) {
  const udf1 = r.udf1 || '', udf2 = r.udf2 || '';
  const h = createHash('sha512').update(`${cfg.salt}|${r.status}||||||||||${udf2}|${udf1}|${r.email}|${r.firstname}|${r.productinfo}|${r.amount}|${r.txnid}|${cfg.key}`).digest('hex');
  return h === r.hash;
}
