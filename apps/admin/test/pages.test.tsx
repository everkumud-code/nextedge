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
  it('Certificates', async () => { const { default: P } = await import('../src/pages/Certificates'); const r = await check('Certificates', P, ['Certificates', 'Register', 'Issue & open PDF', 'BF/', 'TC/']); expect(r.missing).toEqual([]); });
});
describe('school pages 3', () => {
  beforeAll(async () => { await login('Demo Public School', 'principal@demo.school'); });
  it('Payroll', async () => { const { default: P } = await import('../src/pages/Payroll'); const r = await check('Payroll', P, ['Payroll', 'payslips', 'Gross payable', 'Net payable']); expect(r.missing).toEqual([]); });
  it('Biometric', async () => { const { default: P } = await import('../src/pages/Biometric'); const r = await check('Biometric', P, ['Biometric', 'Endpoint', 'API key', 'import an exported log']); expect(r.missing).toEqual([]); });
  it('Insights', async () => { const { default: P } = await import('../src/pages/Insights'); const r = await check('Insights', P, ['Reports & graphs', 'Fee collection', 'Strength by class', 'UDISE', 'Enrolment by class']); expect(r.missing).toEqual([]); });
  it('SchoolProfile', async () => { const { default: P } = await import('../src/pages/SchoolProfile'); errors.length = 0; const r = show(P); await settle(); const vals = [...r.container.querySelectorAll('input')].map((i: any) => i.value).join('|'); console.log('SchoolProfile: ' + (vals.includes('Dr. Meera Sinha') && vals.includes('2026-27') && vals.includes('CBSE') ? 'ok' : 'MISSING values ' + vals.slice(0, 120)) + (errors.length ? ' | ERRORS ' + errors[0].slice(0, 150) : '')); expect(vals).toContain('Dr. Meera Sinha'); });
  it('Records/admission', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/admission', P, ['Admission applications', 'Online admission form', '/apply/', 'Copy link', 'Test Applicant'], '/records/admission'); expect(r.missing).toEqual([]); });
  it('Records/ptm', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/ptm', P, ['Publish my PTM slots', 'PTM slots'], '/records/ptm-slot'); expect(r.missing).toEqual([]); });
  it('Records/employee', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/employee', P, ['Employees', 'Anita Verma', 'TGT Maths'], '/records/employee'); expect(r.missing).toEqual([]); });
  it('Apply (public)', async () => { const { default: P } = await import('../src/pages/Apply'); const me = JSON.parse(localStorage.getItem('user') || '{}'); errors.length = 0; const r = render(<MemoryRouter initialEntries={['/apply/' + me.centreId]}><Routes><Route path="/apply/:centreId" element={<P />} /></Routes></MemoryRouter>); await settle(); const t = r.container.textContent || ''; const miss = ['Demo Public School', 'Admission application', 'Class applying for', 'Submit application'].filter((x) => !t.includes(x)); console.log('Apply: ' + (miss.length ? 'MISSING ' + JSON.stringify(miss) : 'ok')); expect(miss).toEqual([]); });
  it('Fees fine UI', async () => { const { default: P } = await import('../src/pages/Fees'); const r = show(P); await settle(); fireEvent.click([...r.container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Defaulters')) as HTMLElement); await settle(300); const t = r.container.textContent || ''; console.log('FeesFine: ' + (t.includes('Apply late fine') ? 'ok' : 'MISSING Apply late fine')); expect(t).toContain('Apply late fine'); });
});
describe('owner pages', () => {
  beforeAll(async () => { await login('Demo Coaching Centre', 'owner@demo.coaching'); });
  it('Students', async () => { const { default: P } = await import('../src/pages/Students'); const r = await check('Students', P, ['Aarav Kumar', 'Priya Singh', 'Add student', 'Import', /parent/i]); expect(r.missing).toEqual([]); });
  it('Batches', async () => { const { default: P } = await import('../src/pages/Batches'); const r = await check('Batches', P, ['Class 12 PCM', 'Students', 'Teachers', 'assign teacher', 'Edit']); expect(r.missing).toEqual([]); });
  it('Attendance', async () => { const { default: P } = await import('../src/pages/Attendance'); const r = await check('Attendance', P, ['Aarav Kumar', 'Roll call', 'Gate scan', 'Monthly register', 'Below 75%', 'present', 'All present']); expect(r.missing).toEqual([]); });
  it('Fees', async () => { const { default: P } = await import('../src/pages/Fees'); const r = await check('Fees', P, ['Overview', 'Students', 'Payments', 'Defaulters', 'Fee plans', 'Collected', 'Outstanding', 'By batch']); expect(r.missing).toEqual([]); });
  it('Study', async () => { const { default: P } = await import('../src/pages/Study'); const r = await check('Study', P, [/subject|chapter/i]); expect(r.missing).toEqual([]); });
  it('Live', async () => { const { default: P } = await import('../src/pages/Live'); const r = await check('Live', P, [/live/i, /start|schedule/i]); expect(r.missing).toEqual([]); });
  it('Tests', async () => { const { default: P } = await import('../src/pages/Tests'); const r = await check('Tests', P, [/test/i, 'Weekly test 1']); expect(r.missing).toEqual([]); });
  it('Homework', async () => { const { default: P } = await import('../src/pages/Homework'); const r = await check('Homework', P, [/homework/i]); expect(r.missing).toEqual([]); });
  it('Notices', async () => { const { default: P } = await import('../src/pages/Notices'); const r = await check('Notices', P, [/notice/i, 'Hello']); expect(r.missing).toEqual([]); });
  it('Timetable', async () => { const { default: P } = await import('../src/pages/Timetable'); const r = await check('Timetable', P, [/timetable|monday|mon/i]); expect(r.missing).toEqual([]); });
  it('Inbox', async () => { const { default: P } = await import('../src/pages/Inbox'); const r = await check('Inbox', P, [/doubt/i, /leave/i, /feedback/i]); expect(r.missing).toEqual([]); });
  it('Enquiries', async () => { const { default: P } = await import('../src/pages/Enquiries'); const r = await check('Enquiries', P, [/enquir/i, 'Lead One']); expect(r.missing).toEqual([]); });
  it('Wishes', async () => { const { default: P } = await import('../src/pages/Wishes'); const r = await check('Wishes', P, [/diwali/i, /birthday/i]); expect(r.missing).toEqual([]); });
  it('Staff', async () => { const { default: P } = await import('../src/pages/Staff'); const r = await check('Staff', P, ['Sharma Sir', 'Demo Front Desk', /teacher/i]); expect(r.missing).toEqual([]); });
  it('StaffAttendance', async () => { const { default: P } = await import('../src/pages/StaffAttendance'); const r = await check('StaffAttendance', P, [/geofence|radius/i, 'Sharma Sir']); expect(r.missing).toEqual([]); });
  it('Subscription', async () => { const { default: P } = await import('../src/pages/Subscription'); const r = await check('Subscription', P, [/plan/i, /email/i, /PayU/i]); expect(r.missing).toEqual([]); });
  it('IdCards', async () => { const { default: P } = await import('../src/pages/IdCards'); const r = await check('IdCards', P, ['Aarav Kumar']); expect(r.missing).toEqual([]); });
  it('Records/transport', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/transport', P, ['Transport routes', 'Route 1', 'Ramesh', 'Student transport'], '/records/transport-route'); expect(r.missing).toEqual([]); });
  it('Records/library', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/library', P, ['Books', 'Verma', 'Book loans'], '/records/book'); expect(r.missing).toEqual([]); });
  it('Records/discipline', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/discipline', P, ['Discipline', 'Add'], '/records/discipline'); expect(r.missing).toEqual([]); });
  it('Records/achievement', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/achievement', P, ['Gold medal', 'Aarav'], '/records/achievement'); expect(r.missing).toEqual([]); });
  it('Records/holiday', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/holiday', P, ['Diwali break', 'holiday'], '/records/holiday'); expect(r.missing).toEqual([]); });
  it('Records/item', async () => { const { default: P } = await import('../src/pages/Records'); const r = await check('Records/item', P, ['Whiteboard markers', 'low'], '/records/item'); expect(r.missing).toEqual([]); });
  it('PayWall', async () => { const { default: P } = await import('../src/pages/PayWall'); const r = await check('PayWall', P, [/pay/i, /manual/i]); expect(r.missing).toEqual([]); });
  it('Dashboard', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard', P, ['Today', 'Active students', 'batch', 'Attendance', 'Collected this month', 'Outstanding', 'Needs action', 'Latest notices', 'Wellbeing', 'Connect your coaching']); expect(r.missing).toEqual([]); });
});

describe('super admin pages', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); });
  it('Centres', async () => { const { default: P } = await import('../src/pages/Centres'); const r = await check('Centres', P, ['Demo Coaching Centre', /create centre/i]); expect(r.missing).toEqual([]); });
  it('Platform', async () => { const { default: P } = await import('../src/pages/Platform'); const r = await check('Platform', P, ['Demo Coaching Centre', /Platform mailbox/i, /PayU/i, /Login OTP/i]); expect(r.missing).toEqual([]); });
  it('Counsellor', async () => { const { default: P } = await import('../src/pages/Counsellor'); const r = await check('Counsellor', P, [/Counsellor console/i, /exam stress|focus/i]); expect(r.missing).toEqual([]); });
});
describe('teacher pages', () => {
  beforeAll(async () => { await login('Demo Coaching Centre', 'teacher@demo.coaching'); });
  it('Attendance (teacher)', async () => { const { default: P } = await import('../src/pages/Attendance'); const r = await check('Attendance/teacher', P, ['Aarav Kumar']); expect(r.missing).toEqual([]); });
  it('Tests (teacher)', async () => { const { default: P } = await import('../src/pages/Tests'); const r = await check('Tests/teacher', P, ['Weekly test 1']); expect(r.missing).toEqual([]); });
  it('Dashboard (teacher)', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard/teacher', P, ['Today', 'Active students']); expect(r.missing).toEqual([]); });
});
