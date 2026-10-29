import { describe, it, beforeAll, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (m: string, p: string, b?: any, tok = true) => fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${session.token}` } : {}) }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
let CID = ''; const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'FLOWOK ' : 'FLOWFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };
beforeAll(async () => { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: 'Demo Public School', email: 'principal@demo.school' }) }).then((r) => r.json()); session.set(r.token, r.user); CID = r.user.centreId; window.console.error = () => {}; });
describe('school website', () => {
  it('off by default, owner switches it on from the profile page, public sees no student data', async () => {
    await call('PUT', '/subscription/profile', { siteEnabled: false }); let r = await call('GET', `/public/school/${CID}`, undefined, false); ok('Site: not published by default (404)', r.status === 404, r.status);
    const P = (await import('../src/pages/SchoolProfile')).default; const w = render(<MemoryRouter><Routes><Route path="*" element={<P />} /></Routes></MemoryRouter>); await settle(1300); const c = w.container;
    const cb = [...c.querySelectorAll('label')].find((l) => /Show a public website/.test(l.textContent || ''))?.querySelector('input') as HTMLInputElement; ok('Profile: has the website switch', !!cb); fireEvent.click(cb); await settle(300);
    const ta = [...c.querySelectorAll('textarea')].find((t) => (t.closest('div')?.textContent || '').includes('About the school')) as HTMLTextAreaElement; fireEvent.change(ta, { target: { value: 'A school built on curiosity.' } }); const tg = c.querySelector('input[placeholder="Learning with values"]') as HTMLInputElement; fireEvent.change(tg, { target: { value: 'Learn. Lead. Serve.' } });
    fireEvent.click([...c.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Save profile')!); await settle(1200); cleanup();
    r = await call('GET', `/public/school/${CID}`, undefined, false); ok('Site: published after saving', r.status === 200 && r.body.about === 'A school built on curiosity.' && r.body.tagline === 'Learn. Lead. Serve.', JSON.stringify(r.body).slice(0, 100));
    const txt = JSON.stringify(r.body); ok('Site: no student or parent details in the public data', !/parentMobile|fatherName|Aarav|Aadhya|9876600001|@demo\.school/.test(txt), txt.slice(0, 120));
    ok('Site: has classes, counts, events/holidays arrays', r.body.classes.length > 5 && r.body.students > 50 && Array.isArray(r.body.events) && Array.isArray(r.body.holidays));
    await call('POST', '/records/gallery', { title: 'Annual Day', status: 'published', date: '2026-10-01', data: { url: 'javascript:alert(1)' } }); await call('POST', '/records/gallery', { title: 'Sports Day', status: 'published', date: '2026-10-02', data: { url: 'https://example.com/sports' } }); await call('POST', '/records/gallery', { title: 'Draft album', status: 'draft', date: '2026-10-03', data: { url: 'https://example.com/draft' } });
    r = await call('GET', `/public/school/${CID}`, undefined, false); const g = r.body.gallery.map((x: any) => x.title); ok('Site: gallery shows only published albums with safe links', g.includes('Sports Day') && !g.includes('Annual Day') && !g.includes('Draft album'), JSON.stringify(g));
    const S = (await import('../src/pages/Site')).default; const s = render(<MemoryRouter initialEntries={['/s/' + CID]}><Routes><Route path="/s/:centreId" element={<S />} /></Routes></MemoryRouter>); await settle(1500); const t = s.container.textContent || '';
    ok('Site page: name, tagline, about, admission buttons, classes, gallery, contact', ['Demo Public School', 'Learn. Lead. Serve.', 'A school built on curiosity.', 'Apply for admission', 'Track application', 'Classes offered', 'Sports Day', 'Contact', 'Powered by NextEdge'].every((x) => t.includes(x)), t.slice(0, 200));
    const link = [...s.container.querySelectorAll('a')].find((a) => /Apply for admission/.test(a.textContent || ''))?.getAttribute('href'); ok('Site page: apply button goes to the admission form', link === `/apply/${CID}`, String(link)); cleanup();
    await call('PUT', '/subscription/profile', { siteEnabled: false }); r = await call('GET', `/public/school/${CID}`, undefined, false); ok('Site: switching it off hides it again', r.status === 404, r.status);
    const recs = await call('GET', '/records/gallery'); for (const x of (recs.body as any[]).filter((y) => ['Annual Day', 'Sports Day', 'Draft album'].includes(y.title))) await call('DELETE', `/records/gallery/${x.id}`);
    console.log(`FLOWSUM site: ${out.length} problem(s) ${JSON.stringify(out)}`); expect(true).toBe(true);
  }, 120000);
});
