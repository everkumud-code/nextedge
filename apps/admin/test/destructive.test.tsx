import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { isDestructive, RECYCLED_TABLES } from '../../api/src/common/destructive';

const apiSrc = path.resolve(__dirname, '../../api/src');
describe('what counts as a delete (API guard)', () => {
  const erase = ['/api/biometric/devices/SN1', '/api/content/c1', '/api/exams/e1', '/api/fees/plans/p1', '/api/fees/assign/s1', '/api/fees/payments/p1', '/api/files/f1', '/api/houses/h1', '/api/houses/points/x',
    '/api/library/books/b1', '/api/library/categories/c1', '/api/messaging/push', '/api/platform/coupons/c1', '/api/records/health/r1'];
  const safe = ['/api/batches/b1/faculty/f1', '/api/houses/roles/r1', '/api/students/s1', '/api/timetable/t1', '/api/timetable/substitutions/s1', '/api/transport/location/mine', '/api/platform/coupon', '/api/subscription/coupon'];
  it.each(erase)('DELETE %s erases data, so only the platform owner may do it', (p) => { expect(isDestructive('DELETE', p)).toBe(true); expect(isDestructive('delete', p + '?centreId=abc')).toBe(true); });
  it.each(safe)('DELETE %s only switches or un-assigns something, and can be undone', (p) => { expect(isDestructive('DELETE', p)).toBe(false); });
  it('reading, adding and editing are never blocked', () => { for (const m of ['GET', 'POST', 'PUT', 'PATCH']) for (const p of [...erase, ...safe]) expect(isDestructive(m, p)).toBe(false); });
  it('a trailing slash or a query string does not hide a delete', () => { expect(isDestructive('DELETE', '/api/exams/e1/')).toBe(true); expect(isDestructive('DELETE', '/api/exams/e1/?x=1')).toBe(true); });

  it('every DELETE route in the API is covered here (a new delete route must be decided on)', () => {
    const routes: string[] = [];
    const walk = (d: string) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.controller.ts')) routes.push(p); } };
    walk(apiSrc);
    const found = routes.reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/@Delete\(/g) || []).length, 0);
    expect(found).toBe(erase.length + safe.length - 1); // platform/coupon and subscription/coupon are the same @Delete('coupon') route listed under two prefixes
  });
  it('the Recycle bin watches the people, money and records tables that the delete routes touch', () => {
    for (const t of ['students', 'fee_payments', 'fee_plans', 'exams', 'exam_marks', 'records', 'files', 'content', 'houses', 'house_points', 'house_roles']) expect(RECYCLED_TABLES).toContain(t as any);
    expect(RECYCLED_TABLES).not.toContain('attendance' as any); // re-marking attendance deletes and re-adds rows all day; it would only fill the bin
  });
  it('the guard: team members never delete, and the default keeps deleting with the platform owner', () => {
    const g = fs.readFileSync(path.join(apiSrc, 'common/auth.guard.ts'), 'utf8');
    expect(g).toContain("process.env.DESTRUCTIVE_POLICY || 'block'"); expect(g).toContain('Platform team members cannot delete client data'); expect(g).toContain('teamIds.has(u.id)');
  });
  it('removing a whole school does not copy it into the Recycle bin (the owner types its name; last night\'s backup exists)', () => {
    expect(fs.readFileSync(path.join(apiSrc, 'platform/platform.controller.ts'), 'utf8')).toContain("set_config('ne.archive', 'off', true)");
  });
});
