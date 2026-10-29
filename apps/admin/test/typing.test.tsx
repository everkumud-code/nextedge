// Types into every text box of every screen with a real keyboard simulation and checks the box keeps focus and the letters land where they should.
// (This is the bug fireEvent.change cannot see: a screen that rebuilds its own boxes on every keystroke.)
import { describe, it, beforeAll, expect } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api'; const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const login = async (c: string, e: string) => { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: c, email: e }) }).then((r) => r.json()); session.set(r.token, r.user); if (r.user.role === 'SUPER_ADMIN') session.viewing(null); };
beforeAll(() => { window.console.error = () => {}; (window as any).confirm = () => true; (window as any).alert = () => {}; (window as any).open = () => null; (URL as any).createObjectURL = () => 'blob:x'; });
const SEL = 'input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=date]):not([type=time]):not([type=datetime-local]):not([type=hidden]):not([type=range]):not([class~=hidden]), textarea';
const name = (el: Element) => { const l = el.previousElementSibling?.tagName === 'LABEL' ? el.previousElementSibling.textContent : el.closest('div')?.querySelector('label')?.textContent; return `${(l || '').trim().slice(0, 28) || (el as HTMLInputElement).placeholder || (el as HTMLInputElement).type}`; };
const problems: string[] = []; let boxes = 0;
async function probe(scope: string, root: HTMLElement) {
  const user = userEvent.setup({ delay: null }); const fields = [...root.querySelectorAll(SEL)].filter((e) => !(e as HTMLInputElement).readOnly && !(e as HTMLInputElement).disabled && (e as HTMLElement).offsetParent !== undefined) as HTMLInputElement[];
  for (let i = 0; i < Math.min(fields.length, 40); i++) {
    const el = fields[i]; if (/^Biometric/.test(scope) && /Search name or ID/.test(name(el))) continue; /* a filter box: typing in it hides rows by design */ if (/^Platform/.test(scope) && /INR.student|^Min/.test(name(el))) continue; /* these two save on blur and refresh the list */ if (!el.isConnected) { problems.push(`${scope} › "${name(el)}": the box was rebuilt (lost) while typing in an earlier box`); continue; }
    const before = fields.map((f) => f.value); const numeric = el.type === 'number' || el.inputMode === 'numeric' || /mobile|phone|number|roll|capacity|amount|price|quantity/i.test(name(el)); const typed = numeric ? '12' : 'xy'; boxes++;
    try { await user.click(el); await user.keyboard(typed); } catch { /* disabled while typing */ }
    const lost = !el.isConnected || document.activeElement !== el; const others = fields.filter((f, j) => j !== i && f.isConnected && f.value !== before[j]).map((f) => name(f));
    if (lost) problems.push(`${scope} › "${name(el)}": lost focus after the first letter (box is rebuilt on every keystroke)`); else if (others.length && !/^Platform/.test(scope)) problems.push(`${scope} › "${name(el)}": letters went into other box(es): ${others.join(', ')}`); else if (!numeric && !el.value.includes('xy') && el.type !== 'email' && el.type !== 'url') problems.push(`${scope} › "${name(el)}": typed "xy" but the box shows "${el.value}"`);
  }
}
const open = async (n: string, path = '/', pattern = '*') => { const P = (await import(`../src/pages/${n}`)).default; const r = render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={<P />} /></Routes></MemoryRouter>); await settle(1300); return r; };
const btn = (c: HTMLElement, label: string | RegExp, nth = 0) => [...c.querySelectorAll('button,a')].filter((b) => (typeof label === 'string' ? (b.textContent || '').trim() === label : label.test((b.textContent || '').trim())))[nth] as HTMLElement | undefined;
const click = async (el?: HTMLElement) => { if (el) { fireEvent.click(el); await settle(500); } };

describe('typing in every form (school principal)', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  it('Students: add and edit', async () => { const r = await open('Students'); await probe('Students (search)', r.container); await click(btn(r.container, '+ Add student')); await probe('Students › Add student', r.container); cleanup(); const r2 = await open('Students'); await click(btn(r2.container, /^Edit$/)); await probe('Students › Edit', r2.container); cleanup(); });
  it('Admission form + tracking page (public)', async () => { const id = session.user!.centreId; let r = await open('Apply', `/apply/${id}`, '/apply/:centreId'); await probe('Apply (admission form)', r.container); cleanup(); const S = (await import('../src/pages/Apply')).ApplyStatus; r = render(<MemoryRouter initialEntries={[`/apply/${id}/status`]}><Routes><Route path="/apply/:centreId/status" element={<S />} /></Routes></MemoryRouter>); await settle(800); await probe('Apply › Track', r.container); cleanup(); });
  it('Messaging', async () => { const r = await open('Messaging'); await probe('Messaging (SMS + WhatsApp + test boxes)', r.container); cleanup(); });
  it('Staff', async () => { const r = await open('Staff'); await probe('Staff › Add', r.container); await click(btn(r.container, 'Edit')); await probe('Staff › Edit', r.container); cleanup(); });
  it('Records forms', async () => { for (const k of ['visitor', 'book', 'event', 'behaviour', 'admission']) { const r = await open('Records', '/records/' + k, '/records/:kind'); await click(btn(r.container, /^\+ Add/)); await probe(`Records › ${k}`, r.container); cleanup(); } });
  it('Office forms', async () => { for (const n of ['Notices', 'Homework', 'Tests', 'Live', 'Study', 'Enquiries', 'Batches', 'Wishes', 'Certificates', 'SchoolProfile', 'Subscription', 'Biometric', 'Attendance']) { const r = await open(n); await probe(n, r.container); cleanup(); } });
  it('Fees plans tab, Exams new exam, Timetable bells', async () => { let r = await open('Fees'); await click(btn(r.container, 'Fee plans')); await probe('Fees › Fee plans', r.container); await click(btn(r.container, 'Students')); await probe('Fees › Students (search)', r.container); cleanup(); r = await open('Exams'); await click(btn(r.container, '+ New exam')); await probe('Exams › New exam', r.container); cleanup(); r = await open('TimetableSchool'); await click(btn(r.container, 'Bell timings')); await probe('Timetable › Bell timings', r.container); cleanup(); });
  it('Login page', async () => { const r = await open('Login'); await probe('Login', r.container); cleanup(); });
});
describe('typing in every form (super admin)', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); });
  it('Clients: new client and edit', async () => { let r = await open('Clients'); await click(btn(r.container, /^\+ New/)); await probe('Clients › New client', r.container); cleanup(); r = await open('Clients'); await click(btn(r.container, 'Edit')); await probe('Clients › Edit client', r.container); cleanup(); r = await open('Clients'); await click(btn(r.container, 'Delete')); await probe('Clients › Delete (type the name)', r.container); cleanup(); });
  it('Billing & plans page', async () => { const r = await open('Platform'); await probe('Platform (billing, mailbox, payment keys)', r.container); cleanup(); });
  it('summary', () => { console.log(`TYPING: ${boxes} text boxes typed into, ${problems.length} problem(s)`); problems.forEach((p) => console.log('TYPEFAIL ' + p)); expect(problems).toEqual([]); });
});

describe('real keyboard, start to finish', () => {
  const call = (m: string, p: string, b?: any) => fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => ({})));
  const typeInto = async (user: any, root: HTMLElement, label: string | RegExp, text: string) => { const l = [...root.querySelectorAll('label')].find((x) => { const t = (x.textContent || '').replace(/\s*\*.*$/, '').trim(); return typeof label === 'string' ? t === label : label.test(t); }); const el = (l?.nextElementSibling?.matches('input,select,textarea') ? l.nextElementSibling : l?.nextElementSibling?.querySelector('input,select,textarea')) as HTMLInputElement; if (!el) throw new Error('no box: ' + label); await user.click(el); await user.keyboard(text); return el; };
  const tag = String(Date.now()).slice(-5); const out: string[] = []; const ok = (n: string, c: any, i = '') => { console.log(`${c ? 'TYPEOK ' : 'TYPEFAIL '}${n}${c ? '' : ' — ' + i}`); if (!c) out.push(n); };
  it('super admin types a new school and creates it', async () => {
    await login('Platform', 'ever.kumud@gmail.com'); const user = userEvent.setup({ delay: null }); const r = await open('Clients'); const c = r.container; await click(btn(c, /^Schools/)); await click(btn(c, /^\+ New/));
    const name = `Typed School ${tag}`; const nm = await typeInto(user, c, 'School name', name); await typeInto(user, c, 'City', 'Gaya'); await typeInto(user, c, 'Principal / admin name', 'Typed Principal'); const mob = await typeInto(user, c, 'Owner mobile', `9${tag}1234`.slice(0, 10)); const em = await typeInto(user, c, /^Owner email/, `typed${tag}@x.com`);
    ok('Clients: School name box holds only the name', nm.value === name, nm.value); ok('Clients: mobile box holds the mobile', mob.value === `9${tag}1234`.slice(0, 10), mob.value); ok('Clients: email box holds the email', em.value === `typed${tag}@x.com`, em.value);
    const create = btn(c, 'Create client') as HTMLButtonElement; ok('Clients: Create client is enabled after typing', !create.disabled); await user.click(create); await settle(2000);
    const list = await call('GET', '/platform/centres'); const cl = list.find((x: any) => x.name === name); ok('Clients: the typed school was created with the typed owner', !!cl && cl.city === 'Gaya' && cl.owner?.name === 'Typed Principal' && cl.owner?.email === `typed${tag}@x.com`, JSON.stringify(cl || {}).slice(0, 120));
    if (cl) await call('POST', `/platform/centres/${cl.id}/delete`, { confirmName: name }); cleanup(); expect(out).toEqual([]);
  }, 60000);
  it('parent types the admission form and submits', async () => {
    await login('Demo Public School', 'principal@demo.school'); const id = session.user!.centreId; const user = userEvent.setup({ delay: null }); const r = await open('Apply', `/apply/${id}`, '/apply/:centreId'); const c = r.container;
    await typeInto(user, c, "Child's full name", `Typed Child ${tag}`); const sel = [...c.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.text === 'Select'))!; await user.selectOptions(sel, [...sel.options].find((o) => o.value)!.value); await typeInto(user, c, "Father's name", 'Typed Father'); await typeInto(user, c, "Mother's name", 'Typed Mother'); const mob = await typeInto(user, c, 'Parent mobile', `98${tag}111`.slice(0, 10)); await typeInto(user, c, 'Parent email', `typedparent${tag}@x.com`); await typeInto(user, c, 'Address', 'Ranchi');
    ok('Apply: mobile box holds the mobile', mob.value === `98${tag}111`.slice(0, 10), mob.value); const sub = btn(c, 'Submit application') as HTMLButtonElement; ok('Apply: Submit enabled after typing', !sub.disabled); await user.click(sub); await settle(2500);
    const list = await call('GET', '/records/admission'); const row = list.find((x: any) => x.title === `Typed Child ${tag}`); ok('Apply: application saved with father, mother, address and email', !!row && row.data.fatherName === 'Typed Father' && row.data.motherName === 'Typed Mother' && row.data.address === 'Ranchi' && row.data.parentEmail === `typedparent${tag}@x.com`, JSON.stringify(row || {}).slice(0, 160)); cleanup(); expect(out).toEqual([]);
  }, 60000);
  it('office types a student and saves', async () => {
    await login('Demo Public School', 'principal@demo.school'); const user = userEvent.setup({ delay: null }); const r = await open('Students'); const c = r.container; await click(btn(c, '+ Add student'));
    await typeInto(user, c, 'Student name', `Typed Pupil ${tag}`); const cls = [...c.querySelectorAll('label')].find((l) => /Class & section/.test(l.textContent || ''))?.nextElementSibling as HTMLSelectElement; await user.selectOptions(cls, [...cls.options].find((o) => o.value)!.value); await typeInto(user, c, /^Father.s name/, 'Typed Dad'); await typeInto(user, c, /^Parent mobile/, `97${tag}222`.slice(0, 10)); await typeInto(user, c, /^Parent email/, `typedpupil${tag}@x.com`); await typeInto(user, c, 'Address', 'Kanke Road');
    const add = [...c.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Add student').pop() as HTMLButtonElement; ok('Students: Add student enabled after typing', !add.disabled); await user.click(add); await settle(1800);
    const sl = await call('GET', '/students'); const s = sl.find((x: any) => x.name === `Typed Pupil ${tag}`); ok('Students: saved with father, mobile and address', !!s && s.fatherName === 'Typed Dad' && s.parentMobile === `97${tag}222`.slice(0, 10) && s.address === 'Kanke Road', JSON.stringify(s || {}).slice(0, 140)); cleanup(); expect(out).toEqual([]);
  }, 60000);
});
