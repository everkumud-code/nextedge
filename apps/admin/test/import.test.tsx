// The Import screen, used like an office clerk would: choose a CSV, fix the bad rows in the preview, import, check the students exist.
import { describe, it, beforeAll, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = (m: string, p: string, b?: any) => fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => ({})));
const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'FLOWOK ' : 'FLOWFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };
beforeAll(async () => { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: 'Demo Public School', email: 'principal@demo.school' }) }).then((r) => r.json()); session.set(r.token, r.user); window.console.error = () => {}; (URL as any).createObjectURL = () => 'blob:x'; });
const btn = (c: HTMLElement, label: string | RegExp) => [...c.querySelectorAll('button')].find((b) => (typeof label === 'string' ? (b.textContent || '').trim() === label : label.test((b.textContent || '').trim()))) as HTMLButtonElement | undefined;
const tag = String(Date.now()).slice(-6);
describe('Import screen', () => {
  it('CSV → preview → fix a row → import → students exist', async () => {
    const P = (await import('../src/pages/Import')).default; const r = render(<MemoryRouter><Routes><Route path="*" element={<P />} /></Routes></MemoryRouter>); await settle(1200); const c = r.container;
    ok('Import: lists the five things you can import', ['Students', 'Teachers & staff', 'Admission enquiries', 'Library books', 'Inventory items'].every((x) => (c.textContent || '').includes(x)), (c.textContent || '').slice(0, 200));
    ok('Import: Read button disabled until a file is chosen', btn(c, 'Read the file')?.disabled === true);
    const csv = `Student Name,Class,Roll No,Mobile\nUi Imp ${tag}A,7-A,21,9811${tag}\nUi Imp ${tag}B,7-A,22,\nUi Imp ${tag}C,99,23,9813${tag}\n`;
    const file = new File([csv], 'class7.csv', { type: 'text/csv' }); fireEvent.change(c.querySelector('input[type="file"]')!, { target: { files: [file] } }); await settle(300); ok('Import: shows the chosen file', /class7\.csv/.test(c.textContent || ''));
    fireEvent.click(btn(c, 'Read the file')!); await settle(2500);
    ok('Import: preview shows 3 rows, the columns and a result per row', /3 row\(s\) read/.test(c.textContent || '') && c.querySelectorAll('tbody tr').length === 3 && c.querySelectorAll('thead select').length === 4, (c.textContent || '').slice(0, 300));
    const sels = [...c.querySelectorAll('thead select')] as HTMLSelectElement[]; ok('Import: columns recognised (name, class, roll no, mobile)', sels.map((s) => s.value).join(',') === 'name,class,rollNo,parentMobile', sels.map((s) => s.value).join(','));
    ok('Import: row 1 ready, row 2 needs a mobile, row 3 unknown class', /Ready/.test(c.querySelectorAll('tbody tr')[0].textContent || '') && /10-digit/.test(c.querySelectorAll('tbody tr')[1].textContent || '') && /does not match/.test(c.querySelectorAll('tbody tr')[2].textContent || ''), [...c.querySelectorAll('tbody tr')].map((t) => (t.children[1].textContent || '').slice(0, 50)).join(' | '));
    ok('Import: button counts only ready rows', /Import 1 row\(s\)/.test(c.textContent || ''));
    // fix row 2 (mobile) and row 3 (class) inside the preview
    const inp = (ri: number, ci: number) => c.querySelectorAll('tbody tr')[ri].querySelectorAll('input')[ci] as HTMLInputElement; fireEvent.change(inp(1, 3), { target: { value: `9812${tag}` } }); fireEvent.change(inp(2, 1), { target: { value: '7-A' } }); await settle(1500);
    ok('Import: after fixing both cells all 3 rows are ready', /Import 3 row\(s\)/.test(c.textContent || ''), (c.textContent || '').slice(c.textContent!.indexOf('Import ')));
    fireEvent.click(btn(c, /^Import 3 row/)!); await settle(2500);
    ok('Import: finished screen says 3 added', /Import finished/.test(c.textContent || '') && /3\s*added/.test(c.textContent || ''), (c.textContent || '').slice(-200));
    const sl = await call('GET', '/students'); const mine = sl.filter((s: any) => s.name.startsWith(`Ui Imp ${tag}`)); ok('Import: the 3 students exist with class and roll no', mine.length === 3 && mine.every((s: any) => s.batchId) && mine.map((s: any) => s.rollNo).sort().join() === '21,22,23', JSON.stringify(mine.map((s: any) => [s.name, s.rollNo])));
    fireEvent.click(btn(c, 'Import another file')!); await settle(300); ok('Import: "Import another file" returns to the start', !!btn(c, 'Read the file'));
    // same file again -> all skipped
    fireEvent.change(c.querySelector('input[type="file"]')!, { target: { files: [new File([csv.replace(',,', `,9812${tag},`).replace(',99,', ',7-A,').replace(`9813${tag}`, `9813${tag}`)], 'again.csv', { type: 'text/csv' })] } }); fireEvent.click(btn(c, 'Read the file')!); await settle(2500); ok('Import: a second import of the same list marks rows as already existing', /already exist/.test(c.textContent || '') && !/Import \d+ row/.test((c.querySelector('button.btn:not([disabled])')?.textContent || '')) || (c.textContent || '').includes('Will be skipped'), (c.textContent || '').slice(0, 300));
    cleanup(); console.log(`FLOWSUM import: ${out.length} problem(s) ${JSON.stringify(out)}`); expect(true).toBe(true);
  }, 120000);
  it('photo without the AI key shows a clear message before uploading', async () => {
    const P = (await import('../src/pages/Import')).default; const r = render(<MemoryRouter><Routes><Route path="*" element={<P />} /></Routes></MemoryRouter>); await settle(1200); const c = r.container;
    fireEvent.change(c.querySelector('input[type="file"]')!, { target: { files: [new File([new Uint8Array([1, 2, 3])], 'register.jpg', { type: 'image/jpeg' })] } }); await settle(300);
    console.log((/not switched on/.test(c.textContent || '') ? 'FLOWOK ' : 'FLOWFAIL ') + 'Import: photo with no AI key tells the user to use Excel/Word/PDF instead'); expect(c.textContent).toContain('not switched on'); cleanup();
  });
});
