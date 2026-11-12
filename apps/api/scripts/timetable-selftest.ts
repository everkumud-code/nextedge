/** Self-test for the automatic timetable maker. Run: npx ts-node scripts/timetable-selftest.ts  (no database needed). */
import { generate, audit, Period, Req, Rule } from '../src/timetable/auto-timetable';

let failed = 0; const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
// 8 teaching periods with a break after period 4 (so period 5 has breakBefore)
const periods: Period[] = [1, 2, 3, 4, 5, 6, 7, 8].map((no) => ({ no, startTime: `${String(7 + no).padStart(2, '0')}:00`, endTime: `${String(7 + no).padStart(2, '0')}:45`, breakBefore: no === 5 }));
const days = [1, 2, 3, 4, 5, 6];

function school(nClasses: number) {
  const classes = Array.from({ length: nClasses }, (_, i) => `C${i + 1}`);
  const subjects = [['Maths', 6], ['English', 5], ['Hindi', 5], ['Science', 5], ['SST', 4], ['Computer', 2], ['PT', 2], ['Art', 1]] as [string, number][];
  // one specialist teacher per subject per group of 3 classes, so teachers are shared across sections and clashes are possible
  const reqs: Req[] = []; const names: Record<string, string> = {}; const bnames: Record<string, string> = {};
  classes.forEach((c, ci) => { bnames[c] = `Class ${c}`; subjects.forEach(([s, n], si) => { const t = `T-${s}-${Math.floor(ci / 3)}`; names[t] = `${s} teacher ${Math.floor(ci / 3) + 1}`; reqs.push({ batchId: c, subject: s, facultyId: t, perWeek: n, doubles: s === 'Computer' ? 1 : 0 }); }); });
  return { classes, reqs, names, bnames };
}

// 1. big school: 12 classes, must place every lesson with no clash at all
{
  const { reqs, names, bnames } = school(12); const rules: Rule[] = [{ facultyId: 'T-Maths-0', maxPerDay: 6, offDays: [6] }, { facultyId: 'T-English-1', maxPerWeek: 20 }];
  const t0 = Date.now(); const r = generate({ days, periods, reqs, rules, fixed: [], busy: [], seed: 42, timeBudgetMs: 6000, names: { batch: bnames, teacher: names } });
  const total = reqs.reduce((n, q) => n + q.perWeek, 0);
  ok(r.stats.lessons === total, `12 classes: ${total} lessons asked`);
  ok(r.unplaced.length === 0, `12 classes: everything placed (${r.stats.placed}/${total}) in ${Date.now() - t0} ms, ${r.stats.attempts} tries${r.unplaced.length ? ' UNPLACED: ' + JSON.stringify(r.unplaced.slice(0, 3)) : ''}`);
  const slots = r.slots.map((s) => { const p = periods.find((x) => x.no === s.period)!; return { ...s, startTime: p.startTime, endTime: p.endTime }; });
  const problems = audit(slots, rules, [{ startTime: '11:45', endTime: '12:00' }], { batch: bnames, teacher: names });
  ok(problems.length === 0, `12 classes: audit finds no overlap / double booking / break / day-off clash${problems.length ? ': ' + problems.slice(0, 3).join(' | ') : ''}`);
  const dup = new Set<string>(); let clash = 0; for (const s of r.slots) { for (const k of [`c|${s.batchId}|${s.weekday}|${s.period}`, `t|${s.facultyId}|${s.weekday}|${s.period}`]) { if (dup.has(k)) clash++; dup.add(k); } }
  ok(clash === 0, 'independent check: no class and no teacher appears twice in the same period');
  const perDaySubject = new Map<string, number>(); for (const s of r.slots) { const k = `${s.batchId}|${s.subject}|${s.weekday}`; perDaySubject.set(k, (perDaySubject.get(k) || 0) + 1); }
  const maxRep = Math.max(...perDaySubject.values()); ok(maxRep <= 2, `no subject more than twice a day in a class (max seen ${maxRep})`);
  const comp = r.slots.filter((s) => s.batchId === 'C1' && s.subject === 'Computer').sort((a, b) => a.weekday - b.weekday || a.period - b.period); ok(comp.length === 2 && comp[0].weekday === comp[1].weekday && comp[1].period === comp[0].period + 1, 'Computer double period sits back to back, on one day');
  ok(!r.slots.some((s) => s.facultyId === 'T-Maths-0' && s.weekday === 6), 'teacher day-off (Saturday) respected');
  const e1 = generate({ days, periods, reqs, rules, fixed: [], busy: [], seed: 7, timeBudgetMs: 2500, names: { batch: bnames, teacher: names } }); ok(JSON.stringify(e1.slots) !== JSON.stringify(r.slots), 'a different seed gives a different arrangement');
}
// 2. impossible: teacher asked for more periods than exist -> must warn and report, never double book
{
  const reqs: Req[] = [{ batchId: 'A', subject: 'Maths', facultyId: 'T', perWeek: 30 }, { batchId: 'B', subject: 'Maths', facultyId: 'T', perWeek: 30 }];
  const r = generate({ days, periods, reqs, rules: [], fixed: [], busy: [], seed: 1, timeBudgetMs: 1500, names: { teacher: { T: 'Mr Sharma' }, batch: { A: '6A', B: '6B' } } });
  ok(r.warnings.some((w) => /Mr Sharma/.test(w)), 'impossible load: warns that the teacher has too many periods');
  ok(r.unplaced.length > 0, 'impossible load: reports what could not be placed');
  const dup = new Set<string>(); let clash = 0; for (const s of r.slots) { const k = `${s.facultyId}|${s.weekday}|${s.period}`; if (dup.has(k)) clash++; dup.add(k); } ok(clash === 0, 'impossible load: still no double booking');
}
// 3. keep existing: a locked lesson stays, teacher busy elsewhere is avoided
{
  const reqs: Req[] = [{ batchId: 'A', subject: 'Maths', facultyId: 'T', perWeek: 3 }];
  const r = generate({ days: [1, 2], periods: periods.slice(0, 3), reqs, rules: [], fixed: [{ batchId: 'A', weekday: 1, period: 1, subject: 'Maths', facultyId: 'T' }], busy: [{ facultyId: 'T', weekday: 1, period: 2 }, { facultyId: 'T', weekday: 2, period: 1 }], seed: 3, timeBudgetMs: 1000 });
  ok(r.slots.length === 2 && r.unplaced.length === 0, 'keep existing: 3 asked, 1 already placed, 2 new placed');
  ok(!r.slots.some((s) => s.weekday === 1 && s.period === 2) && !r.slots.some((s) => s.weekday === 2 && s.period === 1), 'keep existing: avoids periods where the teacher teaches another class');
}
// 4. audit catches a hand-made clash
{
  const a = audit([{ batchId: 'A', weekday: 1, startTime: '08:00', endTime: '08:45', subject: 'Maths', facultyId: 'T' }, { batchId: 'B', weekday: 1, startTime: '08:30', endTime: '09:15', subject: 'Hindi', facultyId: 'T' }], [], [], { teacher: { T: 'Mr Rao' } });
  ok(a.length === 1 && /Mr Rao/.test(a[0]), 'audit: finds a teacher in two places');
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED'); process.exit(failed ? 1 : 0);
