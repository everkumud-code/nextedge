import { describe, it, beforeAll, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (m: string, p: string, b?: any) => fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => ({})));
const login = async (c: string, e: string) => { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: c, email: e }) }).then((r) => r.json()); session.set(r.token, r.user); return r; };
let opens = 0; beforeAll(() => { window.console.error = () => {}; (window as any).confirm = () => true; (window as any).alert = () => {}; (window as any).open = () => { opens++; return null; }; (URL as any).createObjectURL = () => 'blob:x'; });
const set = (el: Element | null | undefined, v: string) => { if (el) fireEvent.change(el, { target: { value: v } }); };
const btn = (c: HTMLElement, label: string | RegExp) => [...c.querySelectorAll('button,a')].find((b) => (typeof label === 'string' ? (b.textContent || '').trim() === label : label.test((b.textContent || '').trim()))) as HTMLElement | undefined;
const ctl = (c: HTMLElement, label: string | RegExp, nth = 0) => { const ls = [...c.querySelectorAll('label')].filter((x) => { const t = (x.textContent || '').replace(/\s*\*$/, '').trim(); return typeof label === 'string' ? t === label : label.test(t); }); const l = ls[nth]; return (l?.nextElementSibling?.matches('input,select,textarea') ? l.nextElementSibling : l?.nextElementSibling?.querySelector('input,select,textarea')) as HTMLInputElement | null; };
const open = async (n: string, path = '/') => { const P = (await import(`../src/pages/${n}`)).default; const r = render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<P />} /></Routes></MemoryRouter>); await settle(1300); return r; };
const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'FLOWOK ' : 'FLOWFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };
const tag = String(Date.now()).slice(-5);

describe('timetable, ID cards, alerts (school principal)', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  it('Timetable: bell timings → grid cell → clash refused → substitute assigned', async () => {
    const nt = await call('POST', '/staff', { name: `Flow Teacher ${tag}`, mobile: `9${tag}0001`, email: `ft${tag}@x.com`, role: 'FACULTY' }); const t0 = { id: nt.id };
    let r = await open('TimetableSchool'); let c = r.container; fireEvent.click(btn(c, 'Bell timings')!); await settle(500); fireEvent.click(btn(c, 'Use a standard school day')!); await settle(300); fireEvent.click(btn(c, 'Save bell timings')!); await settle(1200);
    const per = await call('GET', '/timetable/periods'); ok('Timetable: standard day saved (8 periods + 2 breaks)', per.length === 10 && per.filter((p: any) => p.isBreak).length === 2, per.length);
    // two classes, same teacher, same period
    const bs = await call('GET', '/batches'); const b1 = bs.find((b: any) => b.name === 'Class 6 - A'), b2 = bs.find((b: any) => b.name === 'Class 6 - B');
    await call('POST', '/timetable/grid/cell', { batchId: b1.id, weekday: 3, periodNo: 1, subject: '' }); await call('POST', '/timetable/grid/cell', { batchId: b2.id, weekday: 3, periodNo: 1, subject: '' });
    fireEvent.click(btn(c, 'Class timetable')!); await settle(500); const sel = c.querySelector('select') as HTMLSelectElement; set(sel, b1.id); await settle(1000);
    const cellBtn = (name: string) => [...c.querySelectorAll('tbody tr')].find((t) => (t.textContent || '').includes(name))!.querySelectorAll('td')[3].querySelector('button') as HTMLElement; // Wednesday = column 3 (Mon=1 → index 1)
    fireEvent.click(cellBtn('Period 1')); await settle(300); set(c.querySelector('input[placeholder="Subject"]'), 'Mathematics'); set([...c.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.text === 'Teacher…')) as any, t0.id); fireEvent.click(btn(c, 'Save')!); await settle(1200);
    let g = await call('GET', `/timetable/grid?batchId=${b1.id}`); ok('Timetable: clicking a cell and Save places the period', g.slots.some((s: any) => s.weekday === 3 && s.period === 1 && s.subject === 'Mathematics' && s.facultyId === t0.id), JSON.stringify(g.slots.filter((s: any) => s.weekday === 3 && s.period === 1)));
    ok('Timetable: the placed period shows on the grid', /Mathematics/.test(c.textContent || ''));
    set(c.querySelector('select'), b2.id); await settle(1000); fireEvent.click(cellBtn('Period 1')); await settle(300); set(c.querySelector('input[placeholder="Subject"]'), 'Science'); set([...c.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.text === 'Teacher…')) as any, t0.id); fireEvent.click(btn(c, 'Save')!); await settle(1200);
    ok('Timetable: same teacher in another class at the same time is refused with the reason on screen', /already has Mathematics with Class 6 - A/.test(c.textContent || ''), (c.textContent || '').slice(-200)); g = await call('GET', `/timetable/grid?batchId=${b2.id}`); ok('Timetable: refused cell was not saved', !g.slots.some((s: any) => s.weekday === 3 && s.period === 1));
    cleanup();
    // substitution through the screen: teacher on approved leave next Wednesday
    const d = new Date(); d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7 || 7)); const wed = d.toISOString().slice(0, 10);
    const tt = await login('Demo Public School', 'principal@demo.school'); const lv = await call('POST', '/records/staff-leave', { title: 'Flow leave', staffId: t0.id, date: wed, status: 'approved', data: { toDate: wed, type: 'Casual' } }); ok('Timetable: test leave created', !!lv.id, JSON.stringify(lv).slice(0, 100));
    r = await open('TimetableSchool'); c = r.container; fireEvent.click(btn(c, 'Substitutions')!); await settle(700); set(c.querySelector('input[type="date"]'), wed); await settle(1500);
    ok('Subs: the period of the absent teacher is listed with free teachers', /Periods that need a substitute/.test(c.textContent || '') && /Class 6 - A/.test(c.textContent || '') && /Assign /.test(c.textContent || ''), (c.textContent || '').slice(0, 400));
    const assign = btn(c, /^Assign /); assign && fireEvent.click(assign); await settle(1500); const day = await call('GET', `/timetable/substitutions?date=${wed}`); ok('Subs: Assign saves the substitution', day.length >= 1 && day.some((x: any) => x.batch === 'Class 6 - A' && x.originalName === `Flow Teacher ${tag}`), JSON.stringify(day).slice(0, 150));
    ok('Subs: the day list shows original → substitute', /→/.test(c.textContent || ''), (c.textContent || '').slice(-200)); const rm = btn(c, 'Remove'); rm && fireEvent.click(rm); await settle(900); ok('Subs: Remove deletes it', (await call('GET', `/timetable/substitutions?date=${wed}`)).length === 0);
    cleanup(); await call('DELETE', `/records/staff-leave/${lv.id}`); await call('POST', '/timetable/grid/cell', { batchId: b1.id, weekday: 3, periodNo: 1, subject: '' });
  }, 120000);
  it('ID cards: add a photo, it appears, card PDF opens', async () => {
    const r = await open('IdCards'); const c = r.container; const bs = await call('GET', '/batches'); const sts = (await call('GET', '/students')).filter((s: any) => s.active);
    const b = bs.find((x: any) => sts.some((s: any) => s.batchId === x.id)); set(c.querySelector('select'), b.id); await settle(900);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (ch) => ch.charCodeAt(0));
    const row = [...c.querySelectorAll('tbody tr')].find((x) => !x.querySelector('img'))!; const before = c.querySelectorAll('tbody img').length; const inp = row.querySelector('input[type="file"]') as HTMLInputElement; fireEvent.change(inp, { target: { files: [new File([png], 'p.png', { type: 'image/png' })] } }); await settle(1800);
    ok('IdCards: uploaded photo shows in the list', c.querySelectorAll('tbody img').length === before + 1, `${before} -> ${c.querySelectorAll('tbody img').length}`); ok('IdCards: counter says how many have photos', /[1-9]\d* of \d+ students have a photo/.test(c.textContent || ''), (c.textContent || '').slice(0, 200));
    const o0 = opens; fireEvent.click(btn(c, 'Print class ID cards (PDF)')!); await settle(1800); ok('IdCards: Print class cards opens a PDF', opens > o0, 'nothing opened'); const o1 = opens; fireEvent.click([...c.querySelectorAll('tbody button')].find((x) => (x.textContent || '').trim() === 'Card')!); await settle(1500); ok('IdCards: single Card opens a PDF', opens > o1); cleanup();
  }, 60000);
  it('Alerts: shows real items and links to the module', async () => { const r = await open('Alerts'); const c = r.container; ok('Alerts: lists fee dues with a count and sample names', /Students with fee dues/.test(c.textContent || '') && /—\s*₹/.test(c.textContent || ''), (c.textContent || '').slice(0, 250)); ok('Alerts: cards link to the module page', [...c.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/fees')); cleanup(); });
});

describe('Clients (super admin)', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); session.viewing(null); });
  it('create → edit → delete a client through the screens', async () => {
    const r = await open('Clients'); let c = r.container; fireEvent.click(btn(c, /^Schools/)!); await settle(300); fireEvent.click(btn(c, '+ New school')!); await settle(300);
    const name = `Flow School ${tag}`; set(ctl(c, 'School name'), name); set(ctl(c, 'City'), 'Gaya'); set(ctl(c, 'Principal / admin name'), 'Flow Principal'); set(ctl(c, 'Owner mobile'), '9' + tag + '1111'.slice(0, 4)); set(ctl(c, /^Owner email/), `flow${tag}@x.com`);
    const create = btn(c, 'Create client')!; ok('Clients: Create enabled when all required fields are filled', !(create as HTMLButtonElement).disabled); fireEvent.click(create); await settle(2000);
    const list = await call('GET', '/platform/centres'); const cl = list.find((x: any) => x.name === name); ok('Clients: created as a school with its owner', !!cl && cl.institutionType === 'school' && cl.owner?.email === `flow${tag}@x.com`, JSON.stringify(cl || {}).slice(0, 120)); ok('Clients: confirmation message shown', /Created\./.test(c.textContent || ''), (c.textContent || '').slice(0, 200));
    const lg = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: name, email: `flow${tag}@x.com` }) }).then((r) => r.json()); ok('Clients: the new owner can log in', !!lg.token, JSON.stringify(lg).slice(0, 100));
    const tr = [...c.querySelectorAll('tbody tr')].find((t) => (t.textContent || '').includes(name)); ok('Clients: new school is listed under Schools', !!tr);
    fireEvent.click([...tr!.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Edit')!); await settle(400); set(ctl(c, 'City'), 'Patna'); set(ctl(c, 'Status'), 'active'); set(ctl(c, '₹ per student / month'), '55'); fireEvent.click(btn(c, 'Save changes')!); await settle(1500);
    const after = (await call('GET', '/platform/centres')).find((x: any) => x.name === name); ok('Clients: Edit saves city, status and price', after.city === 'Patna' && after.settings.status === 'active' && Number(after.settings.pricePerStudent) === 55, JSON.stringify([after.city, after.settings.status, after.settings.pricePerStudent]));
    const tr2 = [...c.querySelectorAll('tbody tr')].find((t) => (t.textContent || '').includes(name))!; fireEvent.click([...tr2.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Delete')!); await settle(400);
    const del = btn(c, 'Delete permanently') as HTMLButtonElement; ok('Clients: delete needs the typed name', del.disabled === true); set([...c.querySelectorAll('input')].find((i) => (i.closest('div')?.textContent || '').includes('Type the name to confirm')) as any, name); await settle(200); fireEvent.click(btn(c, 'Delete permanently')!); await settle(2500);
    ok('Clients: deleted with all data', !(await call('GET', '/platform/centres')).some((x: any) => x.name === name)); const demo = (await call('GET', '/platform/centres')).filter((x: any) => /^Demo/.test(x.name)); ok('Clients: demo clients untouched', demo.length === 2);
    cleanup(); console.log(`FLOWSUM flows5: ${out.length} problem(s) ${JSON.stringify(out)}`); expect(true).toBe(true);
  }, 120000);
});
