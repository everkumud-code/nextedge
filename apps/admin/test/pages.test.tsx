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
function show(Page: React.FC, path = '/') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={<Page />} /></Routes></MemoryRouter>); }
const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));
async function check(name: string, Page: React.FC, expects: (string | RegExp)[], path = '/') {
  errors.length = 0; const r = show(Page, path); await settle(); const text = r.container.textContent || '';
  const missing = expects.filter((e) => (typeof e === 'string' ? !text.includes(e) : !e.test(text)));
  const report = `${name}: ${missing.length ? 'MISSING ' + JSON.stringify(missing) : 'ok'}${errors.length ? ' | ERRORS ' + errors.slice(0, 2).join(' ; ').slice(0, 300) : ''} | len=${text.length}`;
  console.log(report); r.unmount(); return { missing, text };
}
describe('owner pages', () => {
  beforeAll(async () => { await login('Demo', 'owner@demo.coaching'); });
  it('Students', async () => { const { default: P } = await import('../src/pages/Students'); const r = await check('Students', P, ['Aarav Kumar', 'Priya Singh', 'Add student', 'Import', /parent/i]); expect(r.missing).toEqual([]); });
  it('Batches', async () => { const { default: P } = await import('../src/pages/Batches'); const r = await check('Batches', P, ['Class 12 PCM', 'Students', 'Teachers', 'assign teacher', 'Edit']); expect(r.missing).toEqual([]); });
  it('Attendance', async () => { const { default: P } = await import('../src/pages/Attendance'); const r = await check('Attendance', P, ['Aarav Kumar', /present/i, /%/]); expect(r.missing).toEqual([]); });
  it('Fees', async () => { const { default: P } = await import('../src/pages/Fees'); const r = await check('Fees', P, ['Aarav Kumar', /due|outstanding/i, /record|payment/i]); expect(r.missing).toEqual([]); });
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
  it('PayWall', async () => { const { default: P } = await import('../src/pages/PayWall'); const r = await check('PayWall', P, [/pay/i, /manual/i]); expect(r.missing).toEqual([]); });
  it('Dashboard', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard', P, ['Today', 'Active students', 'batch', 'Attendance', 'Collected this month', 'Outstanding', 'Needs action', 'Latest notices', 'Wellbeing', 'Psychographic', 'Connect your coaching']); expect(r.missing).toEqual([]); });
});

describe('super admin pages', () => {
  beforeAll(async () => { await login('Platform', 'ever.kumud@gmail.com'); });
  it('Centres', async () => { const { default: P } = await import('../src/pages/Centres'); const r = await check('Centres', P, ['Demo Coaching Centre', /create centre/i]); expect(r.missing).toEqual([]); });
  it('Platform', async () => { const { default: P } = await import('../src/pages/Platform'); const r = await check('Platform', P, ['Demo Coaching Centre', /Platform mailbox/i, /PayU/i, /Login OTP/i]); expect(r.missing).toEqual([]); });
  it('Counsellor', async () => { const { default: P } = await import('../src/pages/Counsellor'); const r = await check('Counsellor', P, [/Counsellor console/i, /Psychographic/i, /exam stress|focus/i]); expect(r.missing).toEqual([]); });
});
describe('teacher pages', () => {
  beforeAll(async () => { await login('Demo', 'teacher@demo.coaching'); });
  it('Attendance (teacher)', async () => { const { default: P } = await import('../src/pages/Attendance'); const r = await check('Attendance/teacher', P, ['Aarav Kumar']); expect(r.missing).toEqual([]); });
  it('Tests (teacher)', async () => { const { default: P } = await import('../src/pages/Tests'); const r = await check('Tests/teacher', P, ['Weekly test 1']); expect(r.missing).toEqual([]); });
  it('Dashboard (teacher)', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard/teacher', P, ['Today', 'Active students']); expect(r.missing).toEqual([]); });
});
