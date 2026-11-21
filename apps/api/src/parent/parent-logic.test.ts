import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAlerts, monthRows, weekOf } from './parent-logic';

const base = { name: 'Aarav Kumar', today: '2026-11-20', days: [] as any[], homework: [] as any[], exams: [] as any[], booksOverdue: 0, balance: 0, leaves: [] as any[] };

test('nothing to do gives one good-news line, never an empty list', () => {
  const a = buildAlerts(base); assert.equal(a.length, 1); assert.equal(a[0].level, 'good'); assert.match(a[0].text, /Aarav/);
});

test('fees due, absent today, low attendance and overdue homework all show, most urgent first', () => {
  const days = Array.from({ length: 10 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, status: i < 4 ? 'PRESENT' : 'ABSENT' })).concat([{ date: '2026-11-20', status: 'ABSENT' }]);
  const a = buildAlerts({ ...base, balance: 14400, days, homework: [{ title: 'Maths sums', subject: 'Maths', dueAt: '2026-11-18T10:00:00.000Z' }] });
  assert.deepEqual(a.map((x) => x.level), ['bad', 'bad', 'warn', 'warn']);
  assert.ok(a.some((x) => /₹14,400/.test(x.text)) && a.some((x) => /absent today/.test(x.text)) && a.some((x) => /below the 75%/.test(x.text)) && a.some((x) => /overdue/.test(x.text)));
  assert.ok(a.every((x) => x.to.startsWith('/p/')));
});

test('attendance under 75% needs at least five marked days, so one absence on day one does not shout', () => {
  const a = buildAlerts({ ...base, today: '2026-11-02', days: [{ date: '2026-11-02', status: 'ABSENT' }] });
  assert.ok(!a.some((x) => /below the 75%/.test(x.text)));
});

test('leave days do not count against attendance', () => {
  const days = [...Array.from({ length: 5 }, (_, i) => ({ date: `2026-11-0${i + 1}`, status: 'PRESENT' })), ...Array.from({ length: 6 }, (_, i) => ({ date: `2026-11-1${i}`, status: 'LEAVE' }))];
  assert.ok(!buildAlerts({ ...base, days }).some((x) => /below the 75%/.test(x.text)));
  assert.equal(monthRows(days, '2026-11-20')[0].pct, 100);
});

test('an exam in the next week and a fresh result both show; an old or unpublished one does not', () => {
  const a = buildAlerts({ ...base, exams: [{ name: 'Unit Test 2', date: '2026-11-24', published: false }, { name: 'Unit Test 1', date: '2026-11-10', published: true }, { name: 'Half Yearly', date: '2026-08-01', published: true }, { name: 'Far exam', date: '2026-12-30', published: false }] });
  assert.ok(a.some((x) => /Unit Test 2 starts on 24 Nov/.test(x.text)));
  assert.ok(a.some((x) => /result of Unit Test 1 is out/.test(x.text)));
  assert.ok(!a.some((x) => /Half Yearly|Far exam/.test(x.text)));
});

test('a decided leave request and overdue books are mentioned', () => {
  const a = buildAlerts({ ...base, booksOverdue: 2, leaves: [{ status: 'approved', fromDate: '2026-11-19', toDate: '2026-11-21' }, { status: 'pending', fromDate: '2026-11-25', toDate: '2026-11-25' }] });
  assert.ok(a.some((x) => /2 library books are overdue/.test(x.text)) && a.some((x) => /19 Nov to 21 Nov was approved/.test(x.text)));
});

test('monthRows: six months, newest first, empty months left out, percentage from present + late over marked', () => {
  const days = [{ date: '2026-11-03', status: 'PRESENT' }, { date: '2026-11-04', status: 'LATE' }, { date: '2026-11-05', status: 'ABSENT' }, { date: '2026-11-06', status: 'LEAVE' }, { date: '2026-09-01', status: 'PRESENT' }];
  const m = monthRows(days, '2026-11-20'); assert.deepEqual(m.map((x) => x.month), ['2026-11', '2026-09']);
  assert.deepEqual({ ...m[0] }, { month: '2026-11', present: 1, late: 1, absent: 1, leave: 1, marked: 3, pct: 67 });
});

test('weekOf: Monday to Saturday in order, sorted by time, Sunday only with classes, period grid wins over loose slots', () => {
  const s = (weekday: number, start: string, subject: string, period: number | null) => ({ weekday, start, end: start.replace(/^\d\d/, (h) => String(Number(h) + 1).padStart(2, '0')), subject, room: null, period, teacher: 'T' });
  const w = weekOf([s(2, '10:00', 'Hindi', 2), s(2, '09:00', 'Maths', 1), s(1, '09:00', 'English', 1), s(1, '09:30', 'Loose', null)]);
  assert.deepEqual(w.map((d) => d.name), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  assert.deepEqual(w[1].periods.map((p) => p.subject), ['Maths', 'Hindi']);
  assert.deepEqual(w[0].periods.map((p) => p.subject), ['English']);
  assert.ok(weekOf([s(0, '09:00', 'Special', null)]).some((d) => d.name === 'Sunday'));
});
