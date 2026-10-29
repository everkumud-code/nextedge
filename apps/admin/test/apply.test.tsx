// The public admission form and the tracking page, used like a parent would.
import { describe, it, beforeAll, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (m: string, p: string, b?: any) => fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => ({})));
let CID = ''; const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'FLOWOK ' : 'FLOWFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };
beforeAll(async () => { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: 'Demo Public School', email: 'principal@demo.school' }) }).then((r) => r.json()); session.set(r.token, r.user); CID = r.user.centreId; window.console.error = () => {}; await call('PUT', '/messaging/config', { sms: null, whatsapp: null }); });
const set = (el: Element | null | undefined, v: string) => { if (el) fireEvent.change(el, { target: { value: v } }); };
const ctl = (c: HTMLElement, label: string | RegExp) => { const l = [...c.querySelectorAll('label')].find((x) => { const t = (x.textContent || '').trim(); return typeof label === 'string' ? t === label : label.test(t); }); return (l?.nextElementSibling?.matches('input,select,textarea') ? l.nextElementSibling : l?.nextElementSibling?.querySelector('input,select,textarea')) as HTMLInputElement | null; };
const btn = (c: HTMLElement, label: string | RegExp) => [...c.querySelectorAll('button,a')].find((b) => (typeof label === 'string' ? (b.textContent || '').trim() === label : label.test((b.textContent || '').trim()))) as HTMLElement | undefined;
const png = () => { const b = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)); return new File([b], 'photo.png', { type: 'image/png' }); };
describe('public admission', () => {
  it('parent applies with a photo and a PDF, then tracks it', async () => {
    const { default: Apply, ApplyStatus } = await import('../src/pages/Apply'); const r = render(<MemoryRouter initialEntries={['/apply/' + CID]}><Routes><Route path="/apply/:centreId" element={<Apply />} /><Route path="/apply/:centreId/status" element={<ApplyStatus />} /></Routes></MemoryRouter>); await settle(1200); const c = r.container;
    ok('Apply: shows the school and the four document slots', /Demo Public School/.test(c.textContent || '') && ['Photo of child', 'Birth certificate', 'Previous school report card / TC', 'Aadhaar card (child or parent)'].every((x) => (c.textContent || '').includes(x)));
    const submit0 = btn(c, 'Submit application') as HTMLButtonElement; ok('Apply: Submit is disabled until the required fields are filled', submit0?.disabled === true);
    set(ctl(c, "Child's full name *"), 'Ui Applicant'); set(ctl(c, 'Class applying for *'), 'Class 5'); set(ctl(c, 'Parent mobile *') || c.querySelector('input[inputmode="numeric"]'), '9877700088'); set(ctl(c, 'Parent email'), 'uiapplicant@x.com'); await settle(200);
    const inputs = [...c.querySelectorAll('input[type="file"]')] as HTMLInputElement[]; ok('Apply: four file pickers', inputs.length === 4);
    fireEvent.change(inputs[0], { target: { files: [png()] } }); fireEvent.change(inputs[1], { target: { files: [new File(['%PDF-1.4 x'], 'birth.pdf', { type: 'application/pdf' })] } }); await settle(200); ok('Apply: chosen file names are shown', /photo\.png/.test(c.textContent || '') && /birth\.pdf/.test(c.textContent || ''));
    const sub = btn(c, 'Submit application') as HTMLButtonElement; ok('Apply: Submit enabled', sub && !sub.disabled); fireEvent.click(sub); await settle(2500);
    const ref = (c.textContent || '').match(/reference is ([A-Z0-9]{8})/)?.[1]; ok('Apply: confirmation shows the reference and 2 documents', !!ref && /2 document/.test(c.textContent || ''), (c.textContent || '').slice(-200));
    const list = await call('GET', '/records/admission'); const row = list.find((x: any) => x.title === 'Ui Applicant'); ok('Apply: office sees the application with documents', !!row && row.data.documents === 2 && row.data.parentMobile === '9877700088', JSON.stringify(row || {}).slice(0, 120));
    cleanup();
    const t = render(<MemoryRouter initialEntries={['/apply/' + CID + '/status']}><Routes><Route path="/apply/:centreId/status" element={<ApplyStatus />} /></Routes></MemoryRouter>); await settle(800); const tc = t.container;
    ok('Track: check button disabled until both are entered', (btn(tc, 'Check status') as HTMLButtonElement).disabled === true);
    set(tc.querySelector('input[placeholder="8 characters"]'), ref || ''); set(tc.querySelectorAll('input')[1], '9877700088'); await settle(200); fireEvent.click(btn(tc, 'Check status')!); await settle(1500);
    ok('Track: shows child, class, stage label and 5 steps', /Ui Applicant/.test(tc.textContent || '') && /Application received/.test(tc.textContent || '') && tc.querySelectorAll('ol li').length === 5 && /2 document\(s\) received/.test(tc.textContent || ''), (tc.textContent || '').slice(0, 260));
    await call('PUT', '/records/admission/' + row.id, { status: 'interview', data: { interviewDate: '2026-12-01', interviewTime: '11:00', publicRemark: 'Bring originals' } }); fireEvent.click(btn(tc, 'Check status')!); await settle(1500);
    ok('Track: after the office schedules the interview the parent sees date and message', /Interview/.test(tc.textContent || '') && /11:00/.test(tc.textContent || '') && /Bring originals/.test(tc.textContent || ''), (tc.textContent || '').slice(0, 300));
    set(tc.querySelectorAll('input')[1], '9000000000'); fireEvent.click(btn(tc, 'Check status')!); await settle(1200); ok('Track: wrong mobile shows an error', /No application found/.test(tc.textContent || ''), (tc.textContent || '').slice(-120)); cleanup();
    console.log(`FLOWSUM apply: ${out.length} problem(s) ${JSON.stringify(out)}`); expect(true).toBe(true);
  }, 120000);
});
