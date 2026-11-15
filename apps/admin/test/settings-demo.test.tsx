import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import fs from 'fs';
import path from 'path';
import SettingsMenu from '../src/components/SettingsMenu';
import { useDemo, RoleView, BackToOwnLogin } from '../src/components/DemoSwitch';
import { canDelete, session } from '../src/api';

const src = (f: string) => fs.readFileSync(path.resolve(__dirname, '../src', f), 'utf8');
const ROLES = [
  { kind: 'admin', label: 'Owner / Principal', userId: 'u-admin', name: 'Dr Rao', title: '', current: false },
  { kind: 'teacher', label: 'Teacher', userId: 'u-teacher', name: 'Mrs Das', title: '', current: true },
  { kind: 'student', label: 'Student', userId: 'u-student', name: 'Riya', title: '', current: false },
];
function Harness() { const demo = useDemo(); return <div><RoleView demo={demo} /><BackToOwnLogin demo={demo} /></div>; }
const mockApi = (demoRoles: any, calls: string[] = []) => vi.stubGlobal('fetch', vi.fn(async (url: string, opts: any = {}) => {
  calls.push(`${opts.method || 'GET'} ${String(url).replace(/^.*\/api/, '')}`);
  const body = String(url).includes('/auth/demo-roles') ? demoRoles : String(url).includes('/auth/demo-switch') ? { token: 't2', user: { id: 'u-student', name: 'Riya', role: 'STUDENT', centreId: 'c1', demoFrom: 'owner-1' }, demoCentreId: 'c1' } : {};
  return { ok: true, status: 200, json: async () => body } as any;
}));
beforeEach(() => { cleanup(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Settings button', () => {
  it('keeps language and colours/font behind one button, closed until it is pressed, closed again by Escape', () => {
    const { container, queryByTestId, getByTestId } = render(<SettingsMenu />);
    expect(queryByTestId('settings-panel')).toBeNull();
    fireEvent.click(getByTestId('settings-button'));
    const panel = getByTestId('settings-panel');
    expect(panel.textContent).toContain('Language'); expect(panel.textContent).toContain('Hinglish'); expect(panel.textContent).toContain('Colours and font');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('[data-testid="settings-panel"]')).toBeNull();
  });
});

describe('Demo: view as + the way back', () => {
  it('a demo centre shows the "View as" dropdown with every kind of login, and the current one is selected', async () => {
    session.set('t', { id: 'owner-1', name: 'Owner', role: 'SUPER_ADMIN', centreId: 'c1' }); mockApi({ available: true, roles: ROLES, switched: false });
    const { findByTestId, queryByTestId } = render(<Harness />);
    const sel = (await findByTestId('role-view')) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['Owner / Principal', 'Teacher', 'Student']); expect(sel.value).toBe('u-teacher');
    expect(queryByTestId('demo-back-bar')).toBeNull();
  });
  it('choosing a role switches the login without OTP (POST /auth/demo-switch with that person)', async () => {
    session.set('t', { id: 'owner-1', name: 'Owner', role: 'SUPER_ADMIN', centreId: 'c1' }); const calls: string[] = []; mockApi({ available: true, roles: ROLES, switched: false }, calls);
    const { findByTestId } = render(<Harness />); const sel = (await findByTestId('role-view')) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: 'u-student' } });
    await waitFor(() => expect(calls).toContain('POST /auth/demo-switch'));
  });
  it('while looking through another login, the way back is always on screen, in the page and under the dropdown', async () => {
    session.set('t', { id: 'u-teacher', name: 'Mrs Das', role: 'FACULTY', centreId: 'c1', demoFrom: 'owner-1' }); mockApi({ available: true, roles: ROLES, switched: true });
    const { findByTestId, getAllByText } = render(<Harness />);
    const bar = await findByTestId('demo-back-bar'); expect(bar.textContent).toContain('Back to my own login'); expect(bar.textContent).toContain('Teacher');
    expect(getAllByText(/Back to my own login/).length).toBe(2);
  });
  it('the way back shows at once from the stored login, before the list has loaded', () => {
    session.set('t', { id: 'u-teacher', name: 'Mrs Das', role: 'FACULTY', centreId: 'c1', demoFrom: 'owner-1' }); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { getByTestId } = render(<Harness />); expect(getByTestId('demo-back-bar').textContent).toContain('Back to my own login');
  });
  it('a real centre shows neither the dropdown nor a back bar', async () => {
    session.set('t', { id: 'u1', name: 'Owner', role: 'ADMIN', centreId: 'c9' }); const calls: string[] = []; mockApi({ available: false, roles: [] }, calls);
    const { container } = render(<Harness />); await waitFor(() => expect(calls).toContain('GET /auth/demo-roles'));
    expect(container.querySelector('[data-testid="role-view"]')).toBeNull(); expect(container.querySelector('[data-testid="demo-back-bar"]')).toBeNull();
  });
});

describe('Only the platform owner deletes', () => {
  it('canDelete(): the owner yes (also with an older login that has no flag), the team no, a client\'s people no', () => {
    session.set('t', { id: '1', name: 'O', role: 'SUPER_ADMIN', centreId: null, canDelete: true }); expect(canDelete()).toBe(true);
    session.set('t', { id: '1', name: 'O', role: 'SUPER_ADMIN', centreId: null }); expect(canDelete()).toBe(true);
    session.set('t', { id: '2', name: 'T', role: 'SUPER_ADMIN', centreId: null, canDelete: false }); expect(canDelete()).toBe(false);
    session.set('t', { id: '3', name: 'P', role: 'ADMIN', centreId: 'c', canDelete: false }); expect(canDelete()).toBe(false);
    session.set('t', { id: '4', name: 'S', role: 'STAFF', centreId: 'c' }); expect(canDelete()).toBe(false);
    localStorage.clear(); expect(canDelete()).toBe(false);
  });
  it('every Delete / Void / Remove button of a client screen is marked, and the stylesheet hides marked buttons for everyone else', () => {
    const css = src('index.css'); expect(css).toMatch(/body\.ne-no-delete \[data-destroy\]\s*\{\s*display:\s*none\s*!important/);
    for (const f of ['pages/Exams.tsx', 'pages/Fees.tsx', 'pages/Records.tsx', 'pages/Library.tsx', 'pages/Houses.tsx', 'pages/Study.tsx', 'components/BiometricMachines.tsx']) {
      const s = src(f); const marked = (s.match(/<button data-destroy/g) || []).length; expect(marked, f).toBeGreaterThan(0);
      // no DELETE call lives in a button that is not marked, except un-assigning (house roles, students are switched off, not erased)
      for (const m of s.matchAll(/<button\b(?:(?!<\/button>)[\s\S])*?<\/button>/g)) { const b = m[0]; if (/method: 'DELETE'/.test(b) && !/data-destroy/.test(b) && !/\/houses\/roles\/|\/students\//.test(b)) throw new Error(`${f}: an unmarked delete button: ${b.slice(0, 120)}`); }
    }
  });
  it('the menu uses the new pieces: Settings button, View as under the centre dropdown, a Recycle bin for the owner', () => {
    const l = src('components/Layout.tsx'); expect(l).toContain('<SettingsMenu />'); expect(l).toContain('<RoleView demo={demo} />'); expect(l).toContain('<BackToOwnLogin demo={demo} />');
    expect(l).not.toMatch(/<LangSwitch/); expect(l).not.toMatch(/<ThemePicker/); expect(l).toContain("'/recycle-bin', 'Recycle bin'");
    expect(l.indexOf('Open centre')).toBeLessThan(l.indexOf('<RoleView demo={demo} />'));
    expect(src('App.tsx')).toContain('path="recycle-bin"');
  });
});
