import { findClashes, repairClashes, type Slot, type Teacher } from '../src/timetable/clash-repair';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };
const T: Teacher[] = [{ id: 'gupta', title: 'Maths faculty' }, { id: 'rao', title: 'Mathematics teacher' }, { id: 'sen', title: 'English' }, { id: 'das', title: 'Science' }];
const sl = (id: string, f: string | null, wd: number, a: string, b: string, subject = 'Maths'): Slot => ({ id, facultyId: f, weekday: wd, startTime: a, endTime: b, subject });
const apply = (slots: Slot[], ch: { id: string; facultyId: string | null }[]) => slots.map((s) => { const c = ch.find((x) => x.id === s.id); return c ? { ...s, facultyId: c.facultyId } : s; });

// the Gupta Sir case from the demo: two batches, overlapping but different start times
const demo = [sl('a', 'gupta', 1, '17:45', '19:15'), sl('b', 'gupta', 1, '17:00', '18:30'), sl('c', 'gupta', 2, '15:30', '17:00'), sl('d', 'gupta', 2, '16:00', '17:30')];
eq(findClashes(demo).length, 2, 'two clashes found');
const fix = repairClashes(demo, T); const after = apply(demo, fix);
eq([fix.length, findClashes(after).length], [2, 0], 'every clash repaired');
eq(fix.map((f) => f.facultyId), ['rao', 'rao'], 'the other Maths teacher is chosen because the title matches the subject');
eq(after.filter((s) => s.facultyId === 'gupta').length, 2, 'the first class of each pair stays with the original teacher');

// a clean timetable is left alone, and running twice changes nothing more
const clean = [sl('1', 'sen', 1, '08:00', '08:40', 'English'), sl('2', 'sen', 1, '08:40', '09:20', 'English'), sl('3', 'sen', 2, '08:00', '08:40', 'English')];
eq(repairClashes(clean, T), [], 'clean timetable untouched'); eq(repairClashes(after, T), [], 'idempotent');
eq(findClashes(clean).length, 0, 'back-to-back classes are not a clash');

// 16 classes in the same period, only 4 teachers: 4 keep their class, the rest become unassigned (null) rather than double booked
const crowd = Array.from({ length: 16 }, (_, i) => sl('x' + String(i).padStart(2, '0'), 'sen', 3, '09:00', '09:40', 'English'));
const c2 = apply(crowd, repairClashes(crowd, T)); eq([findClashes(c2).length, c2.filter((s) => s.facultyId === null).length, c2.filter((s) => s.facultyId).length], [0, 12, 4], 'no free teacher: left unassigned, never double booked');
eq(repairClashes([sl('n', null, 1, '09:00', '10:00')], T), [], 'slots with no teacher are ignored');
console.log(bad ? `${bad} FAILED` : 'clash self-test: all passed'); process.exit(bad ? 1 : 0);
