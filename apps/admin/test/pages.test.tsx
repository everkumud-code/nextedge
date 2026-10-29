// Renders every admin page against the real local API (as owner / super-admin / teacher) and reports what the user would see.
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { session } from '../src/api';
const API = 'http://localhost:3500/api';
async function login(centre: string, email: string) { const r = await fetch(API + '/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centreName: centre, email }) }).then((r) => r.json()).catch((e) => ({ err: String(e) })); if (!r.token) console.log('LOGIN FAILED', JSON.stringify(r).slice(0, 200)); session.set(r.token, r.user); }
const errors: string[] = [];
beforeAll(() => { window.console.error = (...a: any[]) => { const m = a.map(String).join(' '); if (!/act\(|Warning:/.test(m)) errors.push(m); }; });
function show(Page: React.FC, path = '/') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/records/:kind" element={<Page />} /><Route path="*" element={<Page />} /></Routes></MemoryRouter>); }
const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));
async function check(name: string, Page: React.FC, expects: (string | RegExp)[], path = '/') {
  errors.length = 0; const r = show(Page, path); await settle(); const text = r.container.textContent || '';
  const missing = expects.filter((e) => (typeof e === 'string' ? !text.includes(e) : !e.test(text)));
  const report = `${name}: ${missing.length ? 'MISSING ' + JSON.stringify(missing) : 'ok'}${errors.length ? ' | ERRORS ' + errors.slice(0, 2).join(' ; ').slice(0, 300) : ''} | len=${text.length}`;
  console.log(report); r.unmount(); return { missing, text };
}
describe('school pages', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  it('Students (school)', async () => { const { default: P } = await import('../src/pages/Students'); const r = await check('Students/school', P, ['Add student', 'Class & section', 'Adm. no', 'Import from Excel', /\d+ shown/, 'Profile']); expect(r.missing).toEqual([]); });
  it('StudentProfile', async () => { const st = await fetch(API + '/students', { headers: { Authorization: `Bearer ${session.token}` } }).then((r) => r.json()); const { default: P } = await import('../src/pages/StudentProfile'); const Wrap = () => <Routes><Route path="/students/:id" element={<P />} /></Routes>; errors.length = 0; const r = render(<MemoryRouter initialEntries={['/students/' + st[0].id]}><Wrap /></MemoryRouter>); await settle(2500); const text = r.container.textContent || ''; const miss = ['Attendance', 'Fee balance', 'Latest exam', 'Conduct', 'Basics', 'Recent highlights', 'Issue certificate'].filter((x) => !text.includes(x)); console.log('StudentProfile: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok') + ' | len=' + text.length + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 200) : '')); expect(miss).toEqual([]); });
});
describe('school pages 2', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  it('Batches (school)', async () => { const { default: P } = await import('../src/pages/Batches'); const r = await check('Batches/school', P, ['Create classes & sections in one go', 'Class 5 - A', 'Class teacher', 'Promote', 'Anita Verma']); expect(r.missing).toEqual([]); });
  it('Exams', async () => { const { default: P } = await import('../src/pages/Exams'); errors.length = 0; const r = show(P); await settle(); expect(r.container.textContent).toContain('Half-yearly'); const btn = [...r.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Half-yearly')) as HTMLElement; fireEvent.click(btn); await settle(1500); const text = r.container.textContent || ''; const miss = ['Enter marks', 'Analysis & ranks', 'Report cards', 'All saved', 'Maths', 'Total'].filter((x) => !text.includes(x)); console.log('Exams: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok') + ' | inputs=' + r.container.querySelectorAll('input').length + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 200) : '')); expect(miss).toEqual([]); });
  it('Certificates', async () => { const { default: P } = await import('../src/pages/Certificates'); const r = await check('Certificates', P, ['Certificates', 'Register', 'Issue & open PDF', 'BF/']); expect(r.missing).toEqual([]); });
});
describe('school pages 4', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  const tab = async (r: any, label: string) => { fireEvent.click([...r.container.querySelectorAll('button')].find((b: any) => b.textContent?.trim() === label) as HTMLElement); await settle(1200); return r.container.textContent || ''; };
  it('IdCards', async () => { const { default: P } = await import('../src/pages/IdCards'); const r = await check('IdCards', P, ['ID cards', 'Print class ID cards (PDF)', /\d+ of \d+ students have a photo/]); expect(r.missing).toEqual([]); });
  it('Alerts', async () => { const { default: P } = await import('../src/pages/Alerts'); const r = await check('Alerts', P, ['Alerts', 'Students with fee dues', 'Needs action']); expect(r.missing).toEqual([]); });
  it('Access', async () => { const { default: P } = await import('../src/pages/Access'); const r = await check('Access', P, ['Access & security', 'Login history', 'Accounts', 'Principal', 'Logged in', 'Last login']); expect(r.missing).toEqual([]); });
  it('Dashboard alerts widget', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard/school', P, ['Needs your attention', 'All alerts']); expect(r.missing).toEqual([]); });
  it('TimetableSchool (4 tabs)', async () => {
    const { default: P } = await import('../src/pages/TimetableSchool'); errors.length = 0; const r = show(P); await settle(2000); const miss: string[] = []; const need = (t: string, ...xs: string[]) => xs.forEach((x) => { if (!t.includes(x)) miss.push(x); });
    need(r.container.textContent || '', 'Class timetable', 'Substitutions', 'Teacher load', 'Bell timings', 'My week');
    need(await tab(r, 'Bell timings'), 'Use a standard school day', 'Save bell timings', '+ Add period');
    need(await tab(r, 'Class timetable'), 'Mon', 'Sat', 'Class 4 - A', 'Period 1');
    need(await tab(r, 'Substitutions'), 'Periods that need a substitute', 'Another period', 'Substitutions on this day');
    need(await tab(r, 'Teacher load'), 'Periods / week', 'Anita Verma');
    need(await tab(r, 'My week'), 'Mon', 'No periods');
    console.log('TimetableSchool: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok') + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 150) : '')); expect(miss).toEqual([]); r.unmount();
  });
  it('Exams has class report-card button', async () => { const { default: P } = await import('../src/pages/Exams'); errors.length = 0; const r = show(P); await settle(1500); const first = [...r.container.querySelectorAll('button')].find((b: any) => /Half-yearly|Unit|Term/.test(b.textContent || '')) as HTMLElement | undefined; if (first) { fireEvent.click(first); await settle(1200); } const t1 = r.container.textContent || ''; const cards = [...r.container.querySelectorAll('button')].find((b: any) => b.textContent?.trim() === 'Report cards'); if (cards) { fireEvent.click(cards as HTMLElement); await settle(800); } const t = r.container.textContent || ''; console.log('Exams/classcards: ' + (t.includes('Download all report cards of this class') ? 'ok' : 'MISSING button | opened=' + !!first + ' cardsTab=' + !!cards + ' len=' + t.length)); expect(t).toContain('Download all report cards of this class'); r.unmount(); });
});
describe('school pages 3', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  it('Payroll', async () => { const { default: P } = await import('../src/pages/Payroll'); const r = await check('Payroll', P, ['Payroll', 'payslips', 'Gross payable', 'Net payable']); expect(r.missing).toEqual([]); });
  it('Biometric', async () => { const { default: P } = await import('../src/pages/Biometric'); const r = await check('Biometric', P, ['Biometric', 'Endpoint', 'API key', 'import an exported log']); expect(r.missing).toEqual([]); });
  it('Insights', async () => { const { default: P } = await import('../src/pages/Insights'); const r = await check('Insights', P, ['Reports & graphs', 'Fee collection', 'Strength by class', 'UDISE', 'Enrolment by class']); expect(r.missing).toEqual([]); });
  it('SchoolProfile', async () => { const { default: P } = await import('../src/pages/SchoolProfile'); errors.length = 0; const r = show(P); await settle(); const vals = [...r.container.querySelectorAll('input')].map((i: any) => i.value).join('|'); console.log('SchoolProfile: ' + (vals.includes('Dr. Meera Sinha') && vals.includes('2026-27') && vals.includes('CBSE') ? 'ok' : 'MISSING values ' + vals.slice(0, 120)) + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 150) : '')); expect(vals).toContain('Dr. Meera Sinha'); });
  it('Records/admission', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/admission', P, ['Admission applications', 'Online admission form', '/apply/', 'Copy link', 'documents-pending'], '/records/admission'); expect(r.missing).toEqual([]); });
  it('Records/ptm', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/ptm', P, ['Publish my PTM slots', 'PTM slots'], '/records/ptm-slot'); expect(r.missing).toEqual([]); });
  it('Records/employee', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/employee', P, ['Employees', 'Anita Verma', 'TGT Maths'], '/records/employee'); expect(r.missing).toEqual([]); });
  it('Apply (public)', async () => { const { default: P } = await import('../src/pages/Apply'); const me = JSON.parse(localStorage.getItem('user') || '{}'); errors.length = 0; const r = render(<MemoryRouter initialEntries={['/apply/' + me.centreId]}><Routes><Route path="/apply/:centreId" element={<P />} /></Routes></MemoryRouter>); await settle(); const t = r.container.textContent || ''; const miss = ['Demo Public School', 'Admission application', 'Class applying for', 'Submit application'].filter((x) => !t.includes(x)); console.log('Apply: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok')); expect(miss).toEqual([]); });
  it('Fees fine UI', async () => { const { default: P } = await import('../src/pages/Fees'); const r = show(P); await settle(); fireEvent.click([...r.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Defaulters')) as HTMLElement); await settle(300); const t = r.container.textContent || ''; console.log('FeesFine: ' + (t.includes('Apply late fine') ? 'ok' : 'MISSING Apply late fine')); expect(t).toContain('Apply late fine'); });
});
describe('owner pages', () => {
  beforeAll(async () => { await login('Demo Coaching Centre', 'owner@demo.coaching'); });
  it('Students', async () => { const { default: P } = await import('../src/pages/Students'); const r = await check('Students', P, ['Aarav Kumar', 'Priya Singh', 'Add student', 'Import', /parent/i]); expect(r.missing).toEqual([]); });
  it('Batches', async () => { const { default: P } = await import('../src/pages/Batches'); const r = await check('Batches', P, ['Class 12 PCM', 'Students', 'Teachers', 'assign teacher', 'Edit']); expect(r.missing).toEqual([]); });
  it('Attendance', async () => { const { default: P } = await import('../src/pages/Attendance'); const r = await check('Attendance', P, ['Roll call', 'Gate scan', 'Monthly register', 'Below 75%', 'present', 'All present', 'Save']); expect(r.missing).toEqual([]); });
  it('Fees', async () => { const { default: P } = await import('../src/pages/Fees'); const r = await check('Fees', P, ['Overview', 'Students', 'Payments', 'Defaulters', 'Fee plans', 'Collected', 'Outstanding', 'By batch']); expect(r.missing).toEqual([]); });
  it('Study', async () => { const { default: P } = await import('../src/pages/Study'); const r = await check('Study', P, [/subject|chapter/i]); expect(r.missing).toEqual([]); });
  it('Live', async () => { const { default: P } = await import('../src/pages/Live'); const r = await check('Live', P, [/live/i, /start|schedule/i]); expect(r.missing).toEqual([]); });
  it('Tests', async () => { const { default: P } = await import('../src/pages/Tests'); const r = await check('Tests', P, [/test/i, 'Weekly test 1']); expect(r.missing).toEqual([]); });
  it('Homework', async () => { const { default: P } = await import('../src/pages/Homework'); const r = await check('Homework', P, [/homework/i]); expect(r.missing).toEqual([]); });
  it('Notices', async () => { const { default: P } = await import('../src/pages/Notices'); const r = await check('Notices', P, [/notice/i, 'Welcome']); expect(r.missing).toEqual([]); });
  it('Timetable', async () => { const { default: P } = await import('../src/pages/Timetable'); const r = await check('Timetable', P, [/timetable|monday|mon/i]); expect(r.missing).toEqual([]); });
  it('Inbox', async () => { const { default: P } = await import('../src/pages/Inbox'); const r = await check('Inbox', P, [/doubt/i, /leave/i, /feedback/i]); expect(r.missing).toEqual([]); });
  it('Enquiries', async () => { const { default: P } = await import('../src/pages/Enquiries'); const r = await check('Enquiries', P, [/enquir/i, /contacted|demo|admitted/]); expect(r.missing).toEqual([]); });
  it('Wishes', async () => { const { default: P } = await import('../src/pages/Wishes'); const r = await check('Wishes', P, [/diwali/i, /birthday/i]); expect(r.missing).toEqual([]); });
  it('Staff', async () => { const { default: P } = await import('../src/pages/Staff'); const r = await check('Staff', P, ['Sharma Sir', 'Demo Front Desk', /teacher/i]); expect(r.missing).toEqual([]); });
  it('StaffAttendance', async () => { const { default: P } = await import('../src/pages/StaffAttendance'); const r = await check('StaffAttendance', P, [/geofence|radius/i, 'Sharma Sir']); expect(r.missing).toEqual([]); });
  it('Subscription', async () => { const { default: P } = await import('../src/pages/Subscription'); const r = await check('Subscription', P, [/plan/i, /email/i, /PayU/i]); expect(r.missing).toEqual([]); });
  it('IdCards', async () => { const { default: P } = await import('../src/pages/IdCards'); const r = await check('IdCards', P, ['ID cards', 'Print class ID cards (PDF)', /\d+ of \d+ students have a photo/]); expect(r.missing).toEqual([]); });
  it('Records/transport', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/transport', P, ['Transport routes', 'Route 1', 'Ramesh', 'Student transport'], '/records/transport-route'); expect(r.missing).toEqual([]); });
  it('Records/library', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/library', P, ['Books', 'Verma', 'Book loans'], '/records/book'); expect(r.missing).toEqual([]); });
  it('Records/discipline', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/discipline', P, ['Discipline', 'Add'], '/records/discipline'); expect(r.missing).toEqual([]); });
  it('Records/achievement', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/achievement', P, ['Gold medal', 'Aarav'], '/records/achievement'); expect(r.missing).toEqual([]); });
  it('Records/holiday', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/holiday', P, ['Diwali break', 'holiday'], '/records/holiday'); expect(r.missing).toEqual([]); });
  it('Records/item', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/item', P, ['Whiteboard markers', 'low'], '/records/item'); expect(r.missing).toEqual([]); });
  it('PayWall', async () => { const { default: P } = await import('../src/pages/PayWall'); const r = await check('PayWall', P, [/pay/i, /manual/i]); expect(r.missing).toEqual([]); });
  it('Dashboard clock + calendar', async () => { const { default: P } = await import('../src/pages/Dashboard'); errors.length = 0; const r = show(P); await settle(300); const card = r.container.querySelector('[data-testid="clock-card"]'); const txt = card?.textContent || ''; const now = new Date(); const wd = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' }); const mon = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long' }); const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', day: '2-digit' }).format(now); const hasTime = /\d{1,2}:\d{2}:\d{2}/.test(txt); const t1 = card?.querySelector('[aria-label="Current time"]')?.textContent; await settle(1300); const t2 = card?.querySelector('[aria-label="Current time"]')?.textContent; const todayCell = [...(card?.querySelectorAll('.rounded-full') || [])].map((e) => e.textContent); console.log(`ClockCard: weekday=${txt.includes(wd)} month=${txt.includes(mon)} time=${hasTime} ticking=${t1 !== t2} today=${JSON.stringify(todayCell)} expectedDay=${Number(day)}`); expect(txt).toContain(wd); expect(txt).toContain(mon); expect(hasTime).toBe(true); expect(t1).not.toBe(t2); expect(todayCell).toEqual([String(Number(day))]); });
  it('Dashboard', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard', P, ['Today', 'Active students', 'batch', 'Attendance', 'Collected this month', 'Outstanding', 'Needs action', 'Latest notices', 'Wellbeing', 'Connect your coaching']); expect(r.missing).toEqual([]); });
});

describe('super admin open centre', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); });
  it('needs a centre, then works once one is opened', async () => {
    const { api } = await import('../src/api'); const { default: P } = await import('../src/pages/Students');
    session.viewing(null); const raw = await fetch(API + '/students', { headers: { Authorization: `Bearer ${session.token}` } }); const body = await raw.json(); console.log('SuperNoCentre: http ' + raw.status + ' ' + body.message); expect(raw.status).toBe(403); expect(body.message).toContain('Select a centre');
    const cs = await api('/platform/centres'); const sc = cs.find((c: any) => c.name === 'Demo Public School'); session.viewing({ id: sc.id, name: sc.name, institutionType: sc.institutionType });
    const r = await check('SuperOpenedSchool/Students', P, ['Add student', 'Class & section', 'Adm. no', /\d+ shown/]); expect(r.missing).toEqual([]);
    session.viewing(null);
  });
});
describe('super admin pages', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); });
  it('Clients', async () => { const { default: P } = await import('../src/pages/Clients'); errors.length = 0; const r = show(P); await settle(); const t1 = r.container.textContent || ''; fireEvent.click([...r.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Schools')) as HTMLElement); await settle(200); const t2 = r.container.textContent || ''; const miss = [['Clients', t1], ['Coaching centres', t1], ['Demo Coaching Centre', t1], ['Demo package', t1], ['Open panel', t1], ['Remove all except demo', t1], ['Delete', t1], ['Demo Public School', t2], ['Meera Sinha', t2], ['+ New school', t2]].filter(([x, t]) => !(t as string).includes(x as string)).map(([x]) => x); console.log('Clients: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok') + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 150) : '')); expect(miss).toEqual([]); });
  it('ClientDetail', async () => { const { default: P } = await import('../src/pages/ClientDetail'); const { api } = await import('../src/api'); const cs = await api('/platform/centres'); const sc = cs.find((c: any) => c.name === 'Demo Public School'); errors.length = 0; const r = render(<MemoryRouter initialEntries={['/clients/' + sc.id]}><Routes><Route path="/clients/:id" element={<P />} /></Routes></MemoryRouter>); await settle(2500); const t1 = r.container.textContent || ''; fireEvent.click([...r.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Teachers & staff')) as HTMLElement); await settle(200); const t2 = r.container.textContent || ''; const miss = [['Active students', t1], ['Class 5 - A', t1], ['Download Excel', t1], ['Anita Verma', t2], ['Class 5 - A', t2], ['Principal', t2], ['Open full panel', t1]].filter(([x, t]) => !(t as string).includes(x as string)).map(([x]) => x); console.log('ClientDetail: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok') + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 150) : '')); expect(miss).toEqual([]); });
  it('Platform', async () => { const { default: P } = await import('../src/pages/Platform'); const r = await check('Platform', P, ['Demo Coaching Centre', /Platform mailbox/i, /PayU/i, /Login OTP/i]); expect(r.missing).toEqual([]); });
  it('Counsellor', async () => { const { default: P } = await import('../src/pages/Counsellor'); const r = await check('Counsellor', P, [/Counsellor console/i, /exam stress|focus/i]); expect(r.missing).toEqual([]); });
});
describe('teacher pages', () => {
  beforeAll(async () => { await login('Demo Coaching Centre', 'teacher@demo.coaching'); });
  it('Attendance (teacher)', async () => { const { default: P } = await import('../src/pages/Attendance'); const r = await check('Attendance/teacher', P, ['Roll call', 'Save']); expect(r.missing).toEqual([]); });
  it('Tests (teacher)', async () => { const { default: P } = await import('../src/pages/Tests'); const r = await check('Tests/teacher', P, ['Weekly test 1']); expect(r.missing).toEqual([]); });
  it('Dashboard (teacher)', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard/teacher', P, ['Today', 'Active students']); expect(r.missing).toEqual([]); });
});
