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
  it('Dashboard', async () => { const { default: P } = await import('../src/pages/Dashboard'); const r = await check('Dashboard', P, ['Today', 'Active students', 'batch', 'Attendance', 'Collected this month', 'Outstanding', 'Needs action', 'Latest notices', 'Wellbeing', 'Psychographic', 'Connect your coaching']); expect(r.missing).toEqual([]); });
});
