// Drives the REAL screens like a user: opens each module, clicks Add, fills every field, saves, edits, changes status, deletes — and checks the API afterwards.
import { describe, it, beforeAll, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api';
const H = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` });
const call = (m: string, p: string, b?: any) => fetch(API + p, { method: m, headers: H(), body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => ({})));
async function login(centre: string, email: string) { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: centre, email }) }).then((r) => r.json()); session.set(r.token, r.user); }
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
beforeAll(() => { (window as any).confirm = () => true; (window as any).alert = () => {}; (window as any).open = () => null; (URL as any).createObjectURL = () => 'blob:x'; window.console.error = () => {}; });
const today = new Date().toISOString().slice(0, 10);
const set = (el: Element | null | undefined, v: string) => { if (el) fireEvent.change(el, { target: { value: v } }); };
const btn = (c: HTMLElement | Document, label: string | RegExp) => [...c.querySelectorAll('button')].find((b) => (typeof label === 'string' ? (b.textContent || '').trim() === label : label.test((b.textContent || '').trim()))) as HTMLElement | undefined;
const ctl = (c: HTMLElement, label: string) => { const l = [...c.querySelectorAll('label')].find((x) => (x.textContent || '').replace(/\s*\*$/, '').trim() === label.replace(/\s*\*$/, '').trim()); return (l?.nextElementSibling?.matches('input,select,textarea') ? l.nextElementSibling : l?.nextElementSibling?.querySelector('input,select,textarea')) as HTMLInputElement | null; };
const pickFirst = (s: HTMLSelectElement | null) => { if (s) { const o = [...s.options].find((x) => x.value); if (o) set(s, o.value); } };
const SKIP = new Set(['report-remark']);

describe('records modules, used through the screen', () => {
  let kinds: any[] = []; let Records: any;
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); kinds = await call('GET', '/records/kinds'); Records = (await import('../src/pages/Records')).default; await call('POST', '/records/subject', { title: 'Flow subject', data: {} }); });
  it('every module: add → appears → edit → delete', async () => {
    const report: string[] = []; let passed = 0;
    for (const k of kinds) {
      if (SKIP.has(k.key)) continue; const key = k.key; const title = `UI-${key}`; const fail = (why: string) => report.push(`${key}: ${why}`);
      const r = render(<MemoryRouter initialEntries={['/records/' + key]}><Routes><Route path="/records/:kind" element={<Records />} /></Routes></MemoryRouter>); await settle(900);
      const add = btn(r.container, /^\+ Add/); if (!add) { fail('no "+ Add" button'); cleanup(); continue; }
      fireEvent.click(add); await settle(300);
      const form = ([...r.container.querySelectorAll('.fixed')].pop() || r.container) as HTMLElement; const titleLabel = k.titleLabel; set(ctl(form, titleLabel), title); set(ctl(form, k.dateLabel || 'Date'), today);
      if (k.about === 'student') pickFirst(ctl(form, 'Student') || ctl(form, 'Student (optional)')); if (k.about === 'staff') pickFirst(ctl(form, 'Staff member')); if (k.ref) pickFirst(ctl(form, k.ref.label));
      for (const f of k.fields) { const el: any = ctl(form, f.label); if (!el) { fail(`field "${f.label}" not on the form`); continue; } if (el.tagName === 'SELECT') pickFirst(el); else set(el, f.type === 'number' ? '7' : f.type === 'date' ? today : f.type === 'time' ? '10:30' : f.type === 'mobile' ? '9000012345' : f.type === 'url' ? 'https://example.com/a' : 'sample'); }
      const save = btn(form, 'Save'); if (!save) { fail('no Save button'); cleanup(); continue; } fireEvent.click(save); await settle(700);
      let list: any[] = await call('GET', '/records/' + key); let row = list.find((x) => x.title === title);
      if (!row) { fail('Save did not create the record — screen says: ' + (r.container.textContent || '').match(/(is required|not|Select|enabled|Forbidden|must)[^.]{0,80}/)?.[0]); cleanup(); continue; }
      const bad = k.fields.filter((f: any) => f.type !== 'select' && (row.data?.[f.key] === undefined || row.data?.[f.key] === '')).map((f: any) => f.key); if (bad.length) fail('saved without values for: ' + bad.join(','));
      // appears on screen
      cleanup(); const r2 = render(<MemoryRouter initialEntries={['/records/' + key]}><Routes><Route path="/records/:kind" element={<Records />} /></Routes></MemoryRouter>); await settle(900);
      if (!(r2.container.textContent || '').includes(title)) fail('record saved but not visible in the list');
      // edit through the screen
      const tr = [...r2.container.querySelectorAll('tr')].find((x) => (x.textContent || '').includes(title) && !![...x.querySelectorAll('button')].find((b) => /^(Edit|Delete)$/i.test((b.textContent || '').trim()))); const edit = tr && ([...tr.querySelectorAll('button')].find((b) => /^Edit$/i.test((b.textContent || '').trim())) as HTMLElement);
      if (edit) { fireEvent.click(edit); await settle(300); set(ctl(r2.container, titleLabel), title + '-E'); const sv = btn(r2.container, 'Save changes'); if (sv) { fireEvent.click(sv); await settle(600); list = await call('GET', '/records/' + key); if (!list.some((x) => x.title === title + '-E')) fail('Edit → Save changes did not update'); } else fail('no "Save changes" in edit form'); } else fail('no Edit button on the row');
      // status buttons
      const tr2 = [...r2.container.querySelectorAll('tr')].find((x) => (x.textContent || '').includes(title) && !![...x.querySelectorAll('button')].find((b) => /^(Edit|Delete)$/i.test((b.textContent || '').trim()))); const sel = tr2?.querySelector('select') as HTMLSelectElement | null;
      if (sel && k.statuses.length > 1) { set(sel, k.statuses[1]); await settle(600); list = await call('GET', '/records/' + key); const rr = list.find((x) => x.title.startsWith(title)); if (rr && rr.status !== k.statuses[1]) fail(`status change on the row did not save (${rr.status})`); }
      cleanup(); const r3 = render(<MemoryRouter initialEntries={['/records/' + key]}><Routes><Route path="/records/:kind" element={<Records />} /></Routes></MemoryRouter>); await settle(900);
      const tr3 = [...r3.container.querySelectorAll('tr')].find((x) => (x.textContent || '').includes(title) && !![...x.querySelectorAll('button')].find((b) => /^(Edit|Delete)$/i.test((b.textContent || '').trim()))); const del = tr3 && ([...tr3.querySelectorAll('button')].find((b) => /^(Delete|✕|×)$/i.test((b.textContent || '').trim())) as HTMLElement);
      if (del) { fireEvent.click(del); await settle(600); list = await call('GET', '/records/' + key); if (list.some((x) => x.title.startsWith(title))) fail('Delete did not remove'); } else { fail('no Delete button on the row'); await call('DELETE', `/records/${key}/${row.id}`); }
      cleanup(); if (!report.some((x) => x.startsWith(key + ':'))) passed++;
    }
    console.log(`FLOWS records: ${passed}/${kinds.length - SKIP.size} modules fully work through the screen`); for (const x of report) console.log('FLOWFAIL ' + x);
    expect(report).toEqual([]);
  }, 900000);
});
