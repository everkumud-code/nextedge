// Provider adapters for SMS and WhatsApp. Pure functions: they build the provider's HTTP request and throw a readable error when the provider refuses.
// Every provider accepts an optional baseUrl (regional endpoints, and the local mock used by the tests).
export type Kind = 'otp' | 'notice' | 'test';
export type Vars = { code?: string; title?: string; body?: string; text: string };
export type SmsCfg = { provider?: 'msg91' | 'fast2sms' | 'twilio' | 'webhook'; apiKey?: string; senderId?: string; accountSid?: string; authToken?: string; from?: string; webhookUrl?: string; baseUrl?: string; templates?: { otp?: string; notice?: string }; smsFor?: 'urgent' | 'all' | 'none' };
export type WaCfg = { provider?: 'meta' | 'webhook' | 'legacy'; token?: string; phoneId?: string; webhookUrl?: string; baseUrl?: string; lang?: string; otpButton?: boolean; templates?: { otp?: string; notice?: string } };
export const SMS_PROVIDERS = ['msg91', 'fast2sms', 'twilio', 'webhook'] as const; export const WA_PROVIDERS = ['meta', 'webhook'] as const;

export const to91 = (m: string) => '91' + String(m).replace(/\D/g, '').slice(-10);
async function read(res: Response, who: string) { const t = await res.text(); let j: any = null; try { j = JSON.parse(t); } catch { /* not json */ } if (!res.ok) throw new Error(`${who} ${res.status}: ${(j?.message || j?.error?.message || t).toString().slice(0, 220)}`); return j; }

export function smsReady(c?: SmsCfg | null): string | null {
  if (!c?.provider) return 'No SMS provider chosen'; if (c.provider === 'msg91') return c.apiKey && (c.templates?.otp || c.templates?.notice) ? null : 'MSG91 needs the auth key and a DLT template id';
  if (c.provider === 'fast2sms') return c.apiKey ? null : 'Fast2SMS needs the API key'; if (c.provider === 'twilio') return c.accountSid && c.authToken && c.from ? null : 'Twilio needs account SID, auth token and a from-number';
  if (c.provider === 'webhook') return c.webhookUrl ? null : 'Webhook needs a URL'; return 'Unknown provider';
}
export function waReady(c?: WaCfg | null): string | null {
  if (!c?.provider) return 'No WhatsApp provider chosen'; if (c.provider === 'meta') return c.token && c.phoneId && (c.templates?.otp || c.templates?.notice) ? null : 'Meta Cloud API needs the access token, phone number id and a template name';
  if (c.provider === 'webhook') return c.webhookUrl ? null : 'Webhook needs a URL'; if (c.provider === 'legacy') return null; return 'Unknown provider';
}

export async function smsVia(c: SmsCfg, mobile: string, kind: Kind, v: Vars): Promise<{ ref?: string }> {
  const why = smsReady(c); if (why) throw new Error(why); const to = to91(mobile); const tpl = kind === 'otp' ? c.templates?.otp : c.templates?.notice;
  if (c.provider === 'msg91') {
    const base = c.baseUrl || 'https://control.msg91.com'; const headers = { 'Content-Type': 'application/json', authkey: c.apiKey! };
    if (kind === 'otp') { const j = await read(await fetch(`${base}/api/v5/otp`, { method: 'POST', headers, body: JSON.stringify({ mobile: to, otp: v.code, template_id: tpl }) }), 'MSG91'); if (j?.type === 'error') throw new Error('MSG91: ' + (j.message || 'rejected')); return { ref: j?.request_id }; }
    if (!tpl) throw new Error('MSG91: no notification template id set');
    const j = await read(await fetch(`${base}/api/v5/flow/`, { method: 'POST', headers, body: JSON.stringify({ template_id: tpl, short_url: '0', recipients: [{ mobiles: to, var1: v.title ?? v.text, var2: v.body ?? '' }] }) }), 'MSG91'); if (j?.type === 'error') throw new Error('MSG91: ' + (j.message || 'rejected')); return { ref: j?.request_id || j?.message };
  }
  if (c.provider === 'fast2sms') {
    const base = c.baseUrl || 'https://www.fast2sms.com'; const numbers = to.slice(2);
    const body = kind === 'otp' && !tpl ? { route: 'otp', variables_values: v.code, numbers } : tpl ? { route: 'dlt', sender_id: c.senderId, message: tpl, variables_values: kind === 'otp' ? v.code : `${v.title ?? v.text}|${v.body ?? ''}`, numbers } : { route: 'q', message: v.text, numbers };
    const j = await read(await fetch(`${base}/dev/bulkV2`, { method: 'POST', headers: { 'Content-Type': 'application/json', authorization: c.apiKey! }, body: JSON.stringify(body) }), 'Fast2SMS'); if (j && j.return === false) throw new Error('Fast2SMS: ' + [].concat(j.message || 'rejected').join(' ')); return { ref: j?.request_id };
  }
  if (c.provider === 'twilio') {
    const base = c.baseUrl || 'https://api.twilio.com'; const j = await read(await fetch(`${base}/2010-04-01/Accounts/${c.accountSid}/Messages.json`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64') }, body: new URLSearchParams({ To: '+' + to, From: c.from!, Body: v.text }).toString() }), 'Twilio'); return { ref: j?.sid };
  }
  const j = await read(await fetch(c.webhookUrl!, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) }, body: JSON.stringify({ channel: 'sms', to, kind, text: v.text, code: v.code, title: v.title, body: v.body }) }), 'Webhook'); return { ref: j?.id };
}

export async function waVia(c: WaCfg, mobile: string, kind: Kind, v: Vars, legacy?: (mobile: string, template: string, params: string[]) => Promise<boolean>): Promise<{ ref?: string }> {
  const why = waReady(c); if (why) throw new Error(why); const to = to91(mobile); const tpl = kind === 'otp' ? c.templates?.otp : c.templates?.notice;
  if (c.provider === 'meta') {
    if (!tpl) throw new Error(`Meta WhatsApp: no ${kind === 'otp' ? 'OTP' : 'notification'} template name set`); const base = c.baseUrl || 'https://graph.facebook.com/v20.0';
    const params = (kind === 'otp' ? [v.code!] : [v.title ?? v.text, v.body ?? '']).map((text) => ({ type: 'text', text: String(text).slice(0, 1000) }));
    const components: any[] = [{ type: 'body', parameters: params }]; if (kind === 'otp' && c.otpButton !== false) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: v.code }] });
    const j = await read(await fetch(`${base}/${c.phoneId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` }, body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl, language: { code: c.lang || 'en' }, components } }) }), 'WhatsApp'); return { ref: j?.messages?.[0]?.id };
  }
  if (c.provider === 'legacy') { const sent = await legacy!(to.slice(2), tpl || 'cc_notice', kind === 'otp' ? [v.code!] : [v.title ?? v.text, v.body ?? '']); if (!sent) throw new Error('WhatsApp is not configured'); return {}; }
  const j = await read(await fetch(c.webhookUrl!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'whatsapp', to, kind, text: v.text, code: v.code, title: v.title, body: v.body }) }), 'Webhook'); return { ref: j?.id };
}
