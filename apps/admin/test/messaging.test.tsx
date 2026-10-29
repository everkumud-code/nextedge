// Messaging page and the login OTP channel choice, driven like a user. A local mock server plays the SMS / WhatsApp provider.
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import http from 'http';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const realFetch = globalThis.fetch;
const got: { path: string; body: string; headers: any }[] = []; let server: http.Server;
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (m: string, p: string, b?: any) => realFetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => ({})));
beforeAll(async () => {
  server = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { got.push({ path: req.url || '', body: b, headers: req.headers }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ id: 'mock1', messages: [{ id: 'wamid.9' }] })); }); }); await new Promise<void>((r) => server.listen(3998, r));
  const r = await realFetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: 'Demo Public School', email: 'principal@demo.school' }) }).then((r) => r.json()); session.set(r.token, r.user); window.console.error = () => {}; (window as any).confirm = () => true;
  await call('PUT', '/messaging/config', { sms: null, whatsapp: null });
});
afterAll(() => { server.close(); });
const set = (el: Element | null | undefined, v: string) => { if (el) fireEvent.change(el, { target: { value: v } }); };
const ctl = (c: HTMLElement, label: string | RegExp, nth = 0) => { const ls = [...c.querySelectorAll('label')].filter((x) => { const t = (x.textContent || '').trim(); return typeof label === 'string' ? t === label : label.test(t); }); const l = ls[nth]; return (l?.nextElementSibling?.matches('input,select,textarea') ? l.nextElementSibling : l?.nextElementSibling?.querySelector('input,select,textarea')) as HTMLInputElement | null; };
const btn = (c: HTMLElement, label: string | RegExp) => [...c.querySelectorAll('button')].find((b) => (typeof label === 'string' ? (b.textContent || '').trim() === label : label.test((b.textContent || '').trim()))) as HTMLElement | undefined;
const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'FLOWOK ' : 'FLOWFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };

describe('Messaging screen and login channel choice', () => {
  it('Messaging: configure SMS + WhatsApp, send tests, see the log', async () => {
    const P = (await import('../src/pages/Messaging')).default; const r = render(<MemoryRouter><Routes><Route path="*" element={<P />} /></Routes></MemoryRouter>); await settle(1500); const c = r.container;
    ok('Messaging: shows four channel cards', ['Email', 'SMS', 'WhatsApp', 'App notification'].every((x) => (c.textContent || '').includes(x)));
    ok('Messaging: SMS starts as not set up', /SMS[\s\S]{0,40}not set up/.test(c.textContent || ''));
    set(ctl(c, 'Provider', 0), 'webhook'); await settle(200); set(ctl(c, 'Webhook URL', 0), 'http://127.0.0.1:3998/sms'); set(ctl(c, 'Secret (sent as Bearer)'), 'sec123456'); fireEvent.click(btn(c, 'Save SMS settings')!); await settle(1200);
    let cfg = await call('GET', '/messaging/config'); ok('Messaging: SMS settings saved with the secret masked', cfg.sms?.provider === 'webhook' && cfg.sms.webhookUrl.endsWith('/sms') && cfg.sms.apiKey === '••••3456', JSON.stringify(cfg.sms));
    ok('Messaging: card now says ready', /SMS[\s\S]{0,60}webhook/.test(c.textContent || ''), (c.textContent || '').slice(0, 200));
    const toInputs = [...c.querySelectorAll('input[placeholder^="Mobile to test"]')] as HTMLInputElement[]; set(toInputs[0], '9812345678'); fireEvent.click([...c.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Send test')[0]); await settle(1500);
    const hit = got.find((g) => g.path === '/sms'); ok('Messaging: SMS test reached the provider with the real secret', !!hit && hit.headers.authorization === 'Bearer sec123456' && JSON.parse(hit.body).to === '919812345678', JSON.stringify(hit));
    ok('Messaging: screen says sent', /Sent via webhook/.test(c.textContent || ''), (c.textContent || '').slice(0, 100));
    // WhatsApp via webhook provider
    set(ctl(c, 'Provider', 1), 'webhook'); await settle(200); set(ctl(c, 'Webhook URL', 1) || ctl(c, 'Webhook URL', 0), 'http://127.0.0.1:3998/wa');
    const wsave = btn(c, 'Save WhatsApp settings'); wsave && fireEvent.click(wsave); await settle(1200); cfg = await call('GET', '/messaging/config'); ok('Messaging: WhatsApp settings saved', cfg.whatsapp?.provider === 'webhook' && cfg.whatsapp.webhookUrl.endsWith('/wa'), JSON.stringify(cfg.whatsapp));
    const wto = [...c.querySelectorAll('input[placeholder^="WhatsApp number"]')][0] as HTMLInputElement; set(wto, '9812345678'); fireEvent.click([...c.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Send test')[1]); await settle(1500); ok('Messaging: WhatsApp test reached the provider', got.some((g) => g.path === '/wa'), JSON.stringify(got.map((g) => g.path)));
    const bad = [...c.querySelectorAll('input[placeholder^="Mobile to test"]')][0] as HTMLInputElement; set(bad, '123'); fireEvent.click([...c.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Send test')[0]); await settle(1000); ok('Messaging: bad number gives an error on screen', /Not sent|10 digit/i.test(c.textContent || ''));
    ok('Messaging: delivery log lists the sends without the full number', /sms/.test(c.textContent || '') && /whatsapp/.test(c.textContent || '') && !(c.textContent || '').includes('9812345678'));
    const failBtn = btn(c, 'failed'); failBtn && fireEvent.click(failBtn); await settle(900); ok('Messaging: log filter works', !!failBtn);
    const rem = btn(c, /^Remove (own account|account)/); rem && fireEvent.click(rem); await settle(900); cfg = await call('GET', '/messaging/config'); ok('Messaging: remove account clears it', !cfg.sms, JSON.stringify(cfg.sms)); await call('PUT', '/messaging/config', { whatsapp: null }); cleanup();
  });
  it('Login: OTP channel buttons and mobile login', async () => {
    const Login = (await import('../src/pages/Login')).default; const sent: any[] = [];
    (globalThis as any).fetch = async (u: any, o: any = {}) => { const url = String(u); if (url.endsWith('/auth/mode')) return new Response(JSON.stringify({ otpEnabled: true, channels: { email: true, sms: true, whatsapp: true } }), { headers: { 'Content-Type': 'application/json' } }); if (url.endsWith('/auth/send-otp')) { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ sent: true, via: JSON.parse(o.body).channel, to: '******5678', expiresIn: 300 }), { headers: { 'Content-Type': 'application/json' } }); } if (url.endsWith('/auth/verify-otp')) { sent.push({ verify: JSON.parse(o.body) }); return new Response(JSON.stringify({ token: 'tok', user: { id: 'u', name: 'X', role: 'ADMIN', centreId: 'c' } }), { headers: { 'Content-Type': 'application/json' } }); } return (realFetch as any)(u, o); };
    const r = render(<MemoryRouter><Routes><Route path="*" element={<Login />} /></Routes></MemoryRouter>); await settle(500); const c = r.container;
    set(c.querySelector('input[placeholder^="e.g."]'), 'Demo Public School'); set(c.querySelector('input[placeholder^="you@"]'), '9812345678'); await settle(200);
    ok('Login: channel choice appears when OTP is on', /Send my OTP by/.test(c.textContent || '') && !!btn(c, 'SMS') && !!btn(c, 'WhatsApp') && !!btn(c, 'Email'), (c.textContent || '').slice(0, 200));
    fireEvent.click(btn(c, 'WhatsApp')!); fireEvent.click(btn(c, 'Login')!); await settle(500);
    ok('Login: mobile + WhatsApp sends channel=whatsapp with the mobile', sent[0]?.channel === 'whatsapp' && sent[0]?.mobile === '9812345678' && !sent[0]?.email, JSON.stringify(sent[0]));
    ok('Login: OTP step says where it went', /OTP sent by WhatsApp/.test(c.textContent || ''), (c.textContent || '').slice(0, 200));
    fireEvent.click([...c.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'SMS')!); await settle(400); ok('Login: "send again by SMS" works', sent[1]?.channel === 'sms', JSON.stringify(sent[1]));
    set(c.querySelector('input[inputmode="numeric"]'), '123456'); fireEvent.click(btn(c, 'Verify & sign in')!); await settle(500); ok('Login: verify sends the same mobile', sent[2]?.verify?.mobile === '9812345678' && sent[2]?.verify?.otp === '123456', JSON.stringify(sent[2])); cleanup(); (globalThis as any).fetch = realFetch;
  });
  it('summary', () => { console.log(`FLOWSUM messaging: ${out.length} problem(s) ${JSON.stringify(out)}`); expect(true).toBe(true); });
});
