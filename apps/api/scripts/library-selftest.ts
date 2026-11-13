import { addDays, amountsFor, availableCopies, cleanBook, daysBetween, daysLate } from '../src/library/library';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };

eq([daysBetween('2026-11-01', '2026-11-11'), addDays('2026-11-28', 5), addDays('2026-12-30', 3)], [10, '2026-12-03', '2027-01-02'], 'date maths');
eq([daysLate('2026-11-10', '2026-11-10', '2026-11-20'), daysLate('2026-11-10', '2026-11-13', '2026-11-20'), daysLate('2026-11-10', null, '2026-11-15'), daysLate('2026-11-10', null, '2026-11-01')], [0, 3, 5, 0], 'days late (on time, late, still out, early)');

const base = { dueDate: '2026-11-10', returnedOn: '2026-11-13', today: '2026-11-20', finePerDay: 2, value: 300 };
eq(amountsFor(base), { late: 6, days: 3, lostCharge: 0, damaged: 0, total: 6 }, '3 days late at Rs 2');
eq(amountsFor({ ...base, returnedOn: '2026-11-10' }).total, 0, 'on time = no fine');
eq(amountsFor({ ...base, waive: true }).total, 0, 'waived');
eq(amountsFor({ ...base, finePerDay: 0 }).total, 0, 'fine switched off');
eq(amountsFor({ ...base, returnedOn: null, lost: true }), { late: 20, days: 10, lostCharge: 300, damaged: 0, total: 320 }, 'lost: late until today + value');
eq(amountsFor({ ...base, returnedOn: '2026-11-10', damagedCharge: 50 }).total, 50, 'damaged charge only');
eq(amountsFor({ ...base, lost: true, waive: true }).total, 300, 'lost, late fine waived, value still charged');
eq([availableCopies(3, 1), availableCopies(1, 1), availableCopies(1, 4), availableCopies(0, 0)], [2, 0, 0, 0], 'available copies');

eq((cleanBook({ title: '  ' }) as any).error, 'Enter the book name.', 'title needed');
eq((cleanBook({ title: 'A', copies: 1.5 }) as any).error?.includes('whole'), true, 'copies whole');
eq((cleanBook({ title: 'A', value: -5 }) as any).error?.includes('negative'), true, 'negative value');
const ok = cleanBook({ title: ' Wings of Fire ', author: ' A. P. J. Abdul Kalam ', publisher: 'Universities Press', category: 'Biography', copies: '3', value: '250.4', finePerDay: '' }) as any;
eq(ok.ok, { title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam', publisher: 'Universities Press', category: 'Biography', isbn: '', shelf: '', copies: 3, value: 250, finePerDay: null }, 'clean book');
console.log(bad ? `${bad} FAILED` : 'library self-test: all passed'); process.exit(bad ? 1 : 0);
