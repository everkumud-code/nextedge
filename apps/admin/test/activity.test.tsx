import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import fs from 'fs';
import path from 'path';
import { MemoryRouter } from 'react-router-dom';
import { describe as say, loggable, scopeOf, survivesClient, detailOf } from '../../api/src/activity/activity';
import ActivityList from '../src/components/ActivityList';
import Activity from '../src/pages/Activity';
import { session } from '../src/api';

const apiSrc = path.resolve(__dirname, '../../api/src');
const CID = '11111111-2222-3333-4444-555555555555';

describe('what is written to the activity log', () => {
  it('adds, edits and deletes are recorded; reading and chat noise are not', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(loggable(m, '/students/x')).toBe(true);
    expect(loggable('GET', '/students')).toBe(false);
    for (const p of ['/chat/send', '/notifications/read', '/iclock/cdata', '/transport/location/mine', '/auth/link-token']) expect(loggable('POST', p)).toBe(false);
  });
  it('reads in plain words', () => {
    expect(say('POST', '/students', { name: 'Riya Sharma' })).toMatchObject({ action: 'Added · Students', detail: 'Riya Sharma' });
    expect(say('PUT', `/exams/${CID}`, { name: 'Unit test 1' })).toMatchObject({ action: 'Edited · Exams', detail: 'Unit test 1' });
    expect(say('DELETE', `/fees/payments/${CID}`).action).toBe('Deleted · Fees › payments');
    expect(say('POST', `/platform/invoices/${CID}/paid`).action).toBe('Marked paid · Platform › invoices');
    expect(say('POST', '/recycle-bin/restore').action).toBe('Restored · Recycle bin');
  });
  it('never copies a password, code, key or token into the log', () => {
    const d = detailOf({ name: 'Asha', password: 'secret1', otp: '123456', apiKey: 'sk_live', token: 'abc', pass: 'x', smtpPass: 'y' });
    expect(d).toBe('Asha'); expect(detailOf({ password: 'secret1', otp: '1' })).toBe('');
  });
  it('a client\'s own work and support mode belong to that client; the owner\'s platform work belongs to the platform', () => {
    expect(scopeOf({ role: 'ADMIN', centreId: CID }, '/students')).toEqual({ scope: 'client', centreId: CID });
    expect(scopeOf({ role: 'SUPER_ADMIN', centreId: CID, support: true }, '/students')).toEqual({ scope: 'client', centreId: CID });
    expect(scopeOf({ role: 'SUPER_ADMIN', centreId: 'home' }, '/platform/coupons')).toEqual({ scope: 'platform', centreId: null });
    expect(scopeOf({ role: 'SUPER_ADMIN', centreId: 'home' }, `/platform/centres/${CID}/invoice`)).toEqual({ scope: 'platform', centreId: CID });
  });
  it('removing a client keeps one platform line (the client\'s own lines go with it)', () => {
    expect(survivesClient(`/platform/centres/${CID}/delete`)).toBe(true); expect(survivesClient('/platform/centres/purge-non-demo')).toBe(true); expect(survivesClient(`/platform/centres/${CID}/info`)).toBe(false);
  });
});

describe('wiring', () => {
  const read = (f: string) => fs.readFileSync(path.join(apiSrc, f), 'utf8');
  it('every write goes through the interceptor; the log is read-only, kept by a database trigger, and visible only to owners', () => {
    expect(read('app.module.ts')).toContain('APP_INTERCEPTOR'); expect(read('activity/activity.interceptor.ts')).toContain('this.act.record(req, res)');
    const svc = read('activity/activity.service.ts'); expect(svc).toContain('create trigger ne_audit_guard before update or delete on audit_log'); expect(svc).toContain("current_setting('ne.archive', true) = 'off'");
    const c = read('activity/activity.controller.ts'); expect(c).toContain("@Roles('ADMIN', 'SUPER_ADMIN')"); expect(c).not.toMatch(/@(Post|Put|Patch|Delete)\(/);
  });
  it('a refused delete is logged by the guard', () => { const g = read('common/auth.guard.ts'); expect((g.match(/this\.act\.denied\(/g) || []).length).toBe(2); });
  it('the menu has the Activity log for owners and for the platform', () => { const l = fs.readFileSync(path.resolve(__dirname, '../src/components/Layout.tsx'), 'utf8'); expect((l.match(/'\/activity', 'Activity log'/g) || []).length).toBe(2); expect(fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf8')).toContain('path="activity"'); });
});

const ROWS = [
  { id: 'a1', at: '2026-11-15T10:00:00Z', userId: 'u1', userName: 'Mrs Das', role: 'FACULTY', via: null, centreId: CID, centreName: 'Demo', scope: 'client', method: 'POST', area: 'Students', action: 'Added · Students', detail: 'Riya Sharma', path: '/students', ip: '1.2.3.4' },
  { id: 'a2', at: '2026-11-15T10:05:00Z', userId: 'u2', userName: 'Sales Demo', role: 'STAFF', via: null, centreId: CID, centreName: 'Demo', scope: 'client', method: 'DELETE', area: 'Exams', action: 'Not allowed · Deleted · Exams', detail: 'deleting is kept with the platform owner', path: '/exams/1', ip: '' },
];
let urls: string[] = [];
beforeEach(() => { cleanup(); localStorage.clear(); urls = []; });
afterEach(() => vi.unstubAllGlobals());
const mockApi = (summary: any[] = []) => vi.stubGlobal('fetch', vi.fn(async (url: string) => { urls.push(String(url).replace(/^.*\/api/, '')); const body = String(url).includes('/activity/clients') ? summary : { items: ROWS, more: false }; return { ok: true, status: 200, json: async () => body } as any; }));

describe('Activity log screens', () => {
  it('lists who did what, and marks a refused delete', async () => {
    session.set('t', { id: 'o', name: 'Owner', role: 'ADMIN', centreId: CID }); mockApi();
    const { findAllByTestId, container } = render(<ActivityList scope="client" />); const rows = await findAllByTestId('activity-row');
    expect(rows.length).toBe(2); expect(rows[0].textContent).toContain('Mrs Das'); expect(rows[0].textContent).toContain('Added · Students'); expect(rows[0].textContent).toContain('Riya Sharma'); expect(rows[1].querySelector('.text-brick')).not.toBeNull();
    expect(container.textContent).not.toContain('Client</th>');
  });
  it('filters are sent to the server (search, only deletes, dates)', async () => {
    session.set('t', { id: 'o', name: 'Owner', role: 'ADMIN', centreId: CID }); mockApi();
    const { findAllByTestId, getByLabelText, getByText } = render(<ActivityList scope="client" centre={CID} />); await findAllByTestId('activity-row');
    fireEvent.change(getByLabelText('Search'), { target: { value: 'riya' } }); fireEvent.click(getByText(/Only deletes/).querySelector('input') as HTMLInputElement);
    await waitFor(() => expect(urls.some((u) => u.includes('q=riya') && u.includes('only=delete') && u.includes(`centre=${CID}`))).toBe(true));
  });
  it('the platform side has two views: Platform and Client wise, and a client opens its own log', async () => {
    session.set('t', { id: 'sa', name: 'Owner', role: 'SUPER_ADMIN', centreId: null }); mockApi([{ id: CID, name: 'Demo Coaching Centre', city: 'Ranchi', lastAt: '2026-11-15T10:05:00Z', actions7: 12, people7: 3, deletes7: 1, total: 40 }]);
    const { findByTestId, findAllByTestId, getByTestId, findByText } = render(<MemoryRouter initialEntries={['/activity']}><Activity /></MemoryRouter>);
    await findAllByTestId('activity-row'); expect(urls.some((u) => u.includes('scope=platform'))).toBe(true);
    fireEvent.click(getByTestId('act-tab-clients')); const c = await findByTestId('act-client'); expect(c.textContent).toContain('Demo Coaching Centre'); expect(c.textContent).toContain('12');
    fireEvent.click(c); await findByText('← All clients'); await waitFor(() => expect(urls.some((u) => u.includes('scope=client') && u.includes(`centre=${CID}`))).toBe(true));
  });
});
