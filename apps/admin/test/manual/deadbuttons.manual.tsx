// Clicks every button of every page and reports the ones that do NOTHING (no screen change, no network call, no dialog, no file opened).
import { describe, it, beforeAll } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../../src/api';
const API = 'http://localhost:3500/api';
async function login(centre: string, email: string) { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: centre, email }) }).then((r) => r.json()); session.set(r.token, r.user); }
let fetches = 0, dialogs = 0, opens = 0; const realFetch = globalThis.fetch;
beforeAll(() => { (globalThis as any).fetch = (...a: any[]) => { fetches++; return (realFetch as any)(...a); }; (window as any).confirm = () => { dialogs++; return false; }; (window as any).alert = () => { dialogs++; }; (window as any).prompt = () => { dialogs++; return null; }; (window as any).open = () => { opens++; return null; }; (URL as any).createObjectURL = () => 'blob:x'; window.console.error = () => {}; });
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SKIP = /^(log ?out|sign out|✕|×|x)$/i;
function show(Page: React.FC, path: string) { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/records/:kind" element={<Page />} /><Route path="/students/:id" element={<Page />} /><Route path="*" element={<Page />} /></Routes></MemoryRouter>); }
const btns = (c: HTMLElement) => [...c.querySelectorAll('button, a.btn, label.btn-quiet')].filter((b: any) => !b.disabled && !SKIP.test((b.textContent || '').trim()) && (b.textContent || '').trim()) as HTMLElement[];

async function audit(name: string, Page: React.FC, path = '/') {
  let r = show(Page, path); await settle(900); const labels = btns(r.container).map((b) => (b.textContent || '').trim().slice(0, 40)); cleanup();
  const dead: string[] = [];
  for (let i = 0; i < labels.length; i++) {
    r = show(Page, path); await settle(550); const list = btns(r.container); const b = list[i]; if (!b || (b.textContent || '').trim().slice(0, 40) !== labels[i]) { cleanup(); continue; }
    const before = r.container.innerHTML, f0 = fetches, d0 = dialogs, o0 = opens;
    if (b.tagName === 'LABEL') { cleanup(); continue; } // file pickers are tested separately
    fireEvent.click(b); await settle(500);
    const changed = r.container.innerHTML !== before || document.body.innerHTML.length !== 0 && document.querySelectorAll('[role=dialog],.fixed').length > 0 && r.container.innerHTML !== before;
    if (!changed && fetches === f0 && dialogs === d0 && opens === o0) dead.push(labels[i]);
    cleanup();
  }
  console.log(`DEADBTN ${name}: ${labels.length} buttons, ${dead.length} dead${dead.length ? ' → ' + JSON.stringify(dead) : ''}`);
}
const P = (p: string) => async () => (await import(/* @vite-ignore */ p)).default;
const school: [string, string, string?][] = [['Dashboard', '../../src/pages/Dashboard'], ['Students', '../../src/pages/Students'], ['Batches', '../../src/pages/Batches'], ['Exams', '../../src/pages/Exams'], ['Certificates', '../../src/pages/Certificates'], ['Payroll', '../../src/pages/Payroll'], ['Biometric', '../../src/pages/Biometric'], ['Insights', '../../src/pages/Insights'], ['SchoolProfile', '../../src/pages/SchoolProfile'], ['Fees', '../../src/pages/Fees'], ['Attendance', '../../src/pages/Attendance'], ['Notices', '../../src/pages/Notices'], ['Study', '../../src/pages/Study'], ['TimetableSchool', '../../src/pages/TimetableSchool'], ['Alerts', '../../src/pages/Alerts'], ['Access', '../../src/pages/Access'], ['IdCards', '../../src/pages/IdCards'], ['Staff', '../../src/pages/Staff'], ['Enquiries', '../../src/pages/Enquiries'], ['Inbox', '../../src/pages/Inbox'], ['Wishes', '../../src/pages/Wishes'], ['StaffAttendance', '../../src/pages/StaffAttendance'], ['Subscription', '../../src/pages/Subscription'], ['Tests', '../../src/pages/Tests'], ['Homework', '../../src/pages/Homework'], ['Live', '../../src/pages/Live']];
const kinds = ['admission', 'transport-route', 'transport-assign', 'book', 'loan', 'item', 'stock-move', 'visitor', 'service-request', 'discipline', 'behaviour', 'achievement', 'activity', 'health', 'lesson', 'subject', 'syllabus', 'employee', 'staff-leave', 'job-opening', 'candidate', 'payslip', 'teacher-feedback', 'ptm-slot', 'ptm-feedback', 'holiday', 'event', 'invitee', 'gallery', 'duty', 'scheduled-service', 'fee-fine', 'certificate'];
const only = (process.env.DEAD_ONLY || '').split(',').filter(Boolean);
describe('dead-button audit (school principal)', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  for (const [n, p] of school) if (!only.length || only.includes(n)) it(n, async () => { await audit(n, await P(p)()); }, 600000);
  for (const k of kinds) if (!only.length || only.includes('records') || only.includes(k)) it('records/' + k, async () => { await audit('records/' + k, await P('../../src/pages/Records')(), '/records/' + k); }, 600000);
});
describe('dead-button audit (super admin)', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); });
  for (const [n, p] of [['Clients', '../../src/pages/Clients'], ['Platform', '../../src/pages/Platform']]) if (!only.length || only.includes(n)) it(n, async () => { await audit(n, await P(p)()); }, 600000);
});
