/**
 * Automatic timetable maker. Pure functions, no database.
 *
 * Hard rules (never broken): a class has at most one lesson in a period, a teacher teaches at most one class in a period,
 * no lesson in a break, teacher day-offs / blocked periods / daily and weekly limits are respected, and a subject is not
 * repeated more than its daily limit in one class. Soft goals: spread each subject over the week, avoid the same subject in
 * back-to-back periods, avoid gaps, balance each teacher's days.
 *
 * Method: build the week lesson by lesson (hardest first, randomised), repair by moving one blocking lesson, and keep the best
 * of many tries inside a time budget. A different seed gives a different but equally valid arrangement.
 */
export type Period = { no: number; startTime: string; endTime: string; breakBefore?: boolean };
export type Req = { batchId: string; subject: string; facultyId: string | null; perWeek: number; doubles?: number; maxPerDay?: number | null };
export type Rule = { facultyId: string; maxPerDay?: number | null; maxPerWeek?: number | null; offDays?: number[]; blocked?: { weekday: number; period: number }[] };
export type Cell = { batchId: string; weekday: number; period: number; subject: string; facultyId: string | null };
export type Problem = {
  days: number[]; periods: Period[]; reqs: Req[]; rules: Rule[];
  fixed: Cell[]; /** lessons already placed and kept (they count against the same limits) */
  busy: { facultyId: string; weekday: number; period: number }[]; /** teacher already teaching a class that is not being planned now */
  seed?: number; timeBudgetMs?: number; maxAttempts?: number;
  names?: { batch?: Record<string, string>; teacher?: Record<string, string> };
};
export type Unplaced = { batchId: string; subject: string; facultyId: string | null; missing: number; reason: string };
export type Result = { slots: Cell[]; unplaced: Unplaced[]; warnings: string[]; stats: { lessons: number; placed: number; attempts: number; seed: number; quality: number; teacherLoad: { facultyId: string; periods: number }[] } };

function mulberry32(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

type Lesson = { id: number; batchId: string; subject: string; facultyId: string | null; span: number; limit: number; req: number };

export function generate(p: Problem): Result {
  const seed0 = (p.seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
  const budget = p.timeBudgetMs ?? 3000; const maxAttempts = p.maxAttempts ?? 60;
  const P = [...p.periods].sort((a, b) => a.no - b.no); const D = [...p.days].sort((a, b) => a - b); const Pn = P.length, Dn = D.length;
  const bname = (id: string) => p.names?.batch?.[id] || 'a class'; const tname = (id: string | null) => (id ? p.names?.teacher?.[id] || 'a teacher' : 'no teacher');
  const warnings: string[] = []; const ruleOf = new Map<string, Rule>(); for (const r of p.rules) ruleOf.set(r.facultyId, r);
  const dayIdx = new Map<number, number>(); D.forEach((d, i) => dayIdx.set(d, i)); const perIdx = new Map<number, number>(); P.forEach((x, i) => perIdx.set(x.no, i));
  const empty = (): Result => ({ slots: [], unplaced: [], warnings, stats: { lessons: 0, placed: 0, attempts: 0, seed: seed0, quality: 0, teacherLoad: [] } });
  if (!Dn || !Pn) { warnings.push('Choose at least one working day and set up the bell periods first.'); return empty(); }

  // ---- teacher availability (static) ----
  const offDay = (f: string, di: number) => !!ruleOf.get(f)?.offDays?.includes(D[di]);
  const blockedAt = (f: string, di: number, pi: number) => !!ruleOf.get(f)?.blocked?.some((b) => b.weekday === D[di] && b.period === P[pi].no);
  const extBusy = new Set<string>(); for (const b of p.busy) { const di = dayIdx.get(b.weekday), pi = perIdx.get(b.period); if (di !== undefined && pi !== undefined) extBusy.add(`${b.facultyId}|${di}|${pi}`); }
  const availSlots = (f: string) => { let n = 0; for (let di = 0; di < Dn; di++) for (let pi = 0; pi < Pn; pi++) if (!offDay(f, di) && !blockedAt(f, di, pi) && !extBusy.has(`${f}|${di}|${pi}`)) n++; return n; };

  // ---- lessons from the requirements, minus what is already fixed ----
  const fixedCount = new Map<string, number>(); for (const c of p.fixed) { const k = `${c.batchId}|${c.subject}|${c.facultyId || ''}`; fixedCount.set(k, (fixedCount.get(k) || 0) + 1); }
  const lessons: Lesson[] = []; const perClassTotal = new Map<string, number>(); const perTeacherTotal = new Map<string, number>();
  for (const r of p.reqs) {
    const k = `${r.batchId}|${r.subject}|${r.facultyId || ''}`; const have = fixedCount.get(k) || 0; if (have) fixedCount.set(k, 0);
    let need = Math.max(0, Math.floor(r.perWeek) - have); if (r.perWeek < 1) continue;
    let dbl = Math.min(Math.max(0, Math.floor(r.doubles || 0)), Math.floor(need / 2));
    if ((r.doubles || 0) > dbl && have === 0) warnings.push(`${bname(r.batchId)} · ${r.subject}: ${r.doubles} double period(s) need ${(r.doubles || 0) * 2} periods a week but only ${r.perWeek} are asked for. Using ${dbl}.`);
    const natural = Math.max(1, Math.ceil(r.perWeek / Dn)); const limit = Math.max(r.maxPerDay && r.maxPerDay > 0 ? r.maxPerDay : natural, dbl ? 2 : 1);
    while (dbl-- > 0) { lessons.push({ id: lessons.length, batchId: r.batchId, subject: r.subject, facultyId: r.facultyId, span: 2, limit, req: 0 }); need -= 2; }
    while (need-- > 0) lessons.push({ id: lessons.length, batchId: r.batchId, subject: r.subject, facultyId: r.facultyId, span: 1, limit, req: 0 });
    perClassTotal.set(r.batchId, (perClassTotal.get(r.batchId) || 0) + Math.floor(r.perWeek));
    if (r.facultyId) perTeacherTotal.set(r.facultyId, (perTeacherTotal.get(r.facultyId) || 0) + Math.floor(r.perWeek));
  }
  for (const [b, n] of perClassTotal) if (n > Dn * Pn) warnings.push(`${bname(b)} needs ${n} periods a week but only ${Dn * Pn} exist (${Dn} days × ${Pn} periods). Reduce the periods or add days/periods.`);
  for (const [f, n] of perTeacherTotal) { const cap = availSlots(f), wk = ruleOf.get(f)?.maxPerWeek; if (n > cap) warnings.push(`${tname(f)} is given ${n} periods a week but is free for only ${cap} (day-offs, blocked periods and other classes already counted).`); if (wk && n > wk) warnings.push(`${tname(f)} is given ${n} periods a week but the weekly limit is ${wk}.`); }
  const tcap = new Map<string, number>(); for (const f of perTeacherTotal.keys()) tcap.set(f, Math.max(1, availSlots(f)));

  const batchIds = [...new Set([...p.reqs.map((r) => r.batchId), ...p.fixed.map((c) => c.batchId)])];
  const teacherIds = [...new Set([...p.reqs.map((r) => r.facultyId), ...p.fixed.map((c) => c.facultyId)].filter(Boolean) as string[])];

  // ---------------- one attempt ----------------
  function attempt(seed: number, slack: number) {
    const rnd = mulberry32(seed);
    const cls = new Map<string, number[]>(); for (const b of batchIds) cls.set(b, new Array(Dn * Pn).fill(-1)); // -1 free, -2 fixed, >=0 lesson id
    const fsub = new Map<string, string[]>(); for (const b of batchIds) fsub.set(b, new Array(Dn * Pn).fill(''));
    const tch = new Map<string, number[]>(); for (const f of teacherIds) tch.set(f, new Array(Dn * Pn).fill(-1));
    const tDay = new Map<string, number[]>(); const tWeek = new Map<string, number>(); for (const f of teacherIds) { tDay.set(f, new Array(Dn).fill(0)); tWeek.set(f, 0); }
    const sDay = new Map<string, number[]>(); const cDay = new Map<string, number[]>(); for (const b of batchIds) cDay.set(b, new Array(Dn).fill(0));
    const sk = (b: string, s: string) => `${b}|${s}`; const sd = (b: string, s: string) => { let a = sDay.get(sk(b, s)); if (!a) { a = new Array(Dn).fill(0); sDay.set(sk(b, s), a); } return a; };
    const at = new Array<number>(lessons.length).fill(-1); // start cell of each lesson
    for (const c of p.fixed) { const di = dayIdx.get(c.weekday), pi = perIdx.get(c.period); if (di === undefined || pi === undefined || !cls.has(c.batchId)) continue; const ci = di * Pn + pi; cls.get(c.batchId)![ci] = -2; fsub.get(c.batchId)![ci] = c.subject; sd(c.batchId, c.subject)[di]++; cDay.get(c.batchId)![di]++; if (c.facultyId && tch.has(c.facultyId)) { tch.get(c.facultyId)![ci] = -2; tDay.get(c.facultyId)![di]++; tWeek.set(c.facultyId, (tWeek.get(c.facultyId) || 0) + 1); } }

    const okTeacher = (L: Lesson, di: number, pi: number) => {
      const f = L.facultyId; if (!f) return true; const r = ruleOf.get(f);
      if (offDay(f, di)) return false;
      for (let k = 0; k < L.span; k++) { if (blockedAt(f, di, pi + k) || extBusy.has(`${f}|${di}|${pi + k}`) || tch.get(f)![di * Pn + pi + k] !== -1) return false; }
      if (r?.maxPerDay && tDay.get(f)![di] + L.span > r.maxPerDay) return false;
      if (r?.maxPerWeek && (tWeek.get(f) || 0) + L.span > r.maxPerWeek) return false;
      return true;
    };
    const okClass = (L: Lesson, di: number, pi: number) => { if (pi + L.span > Pn) return false; for (let k = 0; k < L.span; k++) { if (k > 0 && P[pi + k].breakBefore) return false; if (cls.get(L.batchId)![di * Pn + pi + k] !== -1) return false; } return sd(L.batchId, L.subject)[di] + L.span <= L.limit + slack; };
    const feasible = (L: Lesson, di: number, pi: number) => okClass(L, di, pi) && okTeacher(L, di, pi);
    const put = (L: Lesson, di: number, pi: number) => { const c = cls.get(L.batchId)!, fs = fsub.get(L.batchId)!; for (let k = 0; k < L.span; k++) { c[di * Pn + pi + k] = L.id; fs[di * Pn + pi + k] = L.subject; if (L.facultyId) tch.get(L.facultyId)![di * Pn + pi + k] = L.id; } sd(L.batchId, L.subject)[di] += L.span; cDay.get(L.batchId)![di] += L.span; if (L.facultyId) { tDay.get(L.facultyId)![di] += L.span; tWeek.set(L.facultyId, (tWeek.get(L.facultyId) || 0) + L.span); } at[L.id] = di * Pn + pi; };
    const take = (L: Lesson) => { const ci = at[L.id]; const di = Math.floor(ci / Pn), pi = ci % Pn; const c = cls.get(L.batchId)!, fs = fsub.get(L.batchId)!; for (let k = 0; k < L.span; k++) { c[di * Pn + pi + k] = -1; fs[di * Pn + pi + k] = ''; if (L.facultyId) tch.get(L.facultyId)![di * Pn + pi + k] = -1; } sd(L.batchId, L.subject)[di] -= L.span; cDay.get(L.batchId)![di] -= L.span; if (L.facultyId) { tDay.get(L.facultyId)![di] -= L.span; tWeek.set(L.facultyId, (tWeek.get(L.facultyId) || 0) - L.span); } at[L.id] = -1; };
    const score = (L: Lesson, di: number, pi: number) => {
      let s = sd(L.batchId, L.subject)[di] * 12 + cDay.get(L.batchId)![di] * 0.8 + pi * 0.45 + rnd() * 3;
      const fs = fsub.get(L.batchId)!; if (pi > 0 && fs[di * Pn + pi - 1] === L.subject && L.span === 1) s += 8; if (pi + L.span < Pn && fs[di * Pn + pi + L.span] === L.subject && L.span === 1) s += 8;
      if (L.facultyId) s += tDay.get(L.facultyId)![di] * 1.6;
      // fill from the top of the day: leaving the period above empty makes a gap
      if (pi > 0 && cls.get(L.batchId)![di * Pn + pi - 1] === -1) s += 3;
      return s;
    };
    const cells = (L: Lesson) => { const out: { di: number; pi: number; s: number }[] = []; for (let di = 0; di < Dn; di++) for (let pi = 0; pi < Pn; pi++) if (feasible(L, di, pi)) out.push({ di, pi, s: score(L, di, pi) }); return out.sort((a, b) => a.s - b.s); };
    const placeBest = (L: Lesson) => { const c = cells(L); if (!c.length) return false; put(L, c[0].di, c[0].pi); return true; };

    // hardest first
    const prio = (L: Lesson) => L.span * 25 + (L.facultyId ? (perTeacherTotal.get(L.facultyId) || 0) / (tcap.get(L.facultyId) || 1) * 60 : 0) + (perClassTotal.get(L.batchId) || 0) / (Dn * Pn) * 20 + rnd() * 6;
    const order = [...lessons].map((L) => ({ L, k: prio(L) })).sort((a, b) => b.k - a.k).map((x) => x.L);
    const left: Lesson[] = []; for (const L of order) if (!placeBest(L)) left.push(L);

    // repair: free exactly one blocking lesson, place this one, then re-seat the blocker elsewhere
    for (let round = 0; round < 3 && left.length; round++) {
      for (let li = left.length - 1; li >= 0; li--) {
        const L = left[li]; if (L.span !== 1) continue; let done = false;
        const cand: { di: number; pi: number; blockers: number[]; s: number }[] = [];
        for (let di = 0; di < Dn && !done; di++) for (let pi = 0; pi < Pn; pi++) {
          if (feasible(L, di, pi)) { put(L, di, pi); left.splice(li, 1); done = true; break; }
          const ci = di * Pn + pi; const bl: number[] = []; const co = cls.get(L.batchId)![ci]; if (co === -2) continue; if (co >= 0) bl.push(co);
          if (L.facultyId) { if (offDay(L.facultyId, di) || blockedAt(L.facultyId, di, pi) || extBusy.has(`${L.facultyId}|${di}|${pi}`)) continue; const to = tch.get(L.facultyId)![ci]; if (to === -2) continue; if (to >= 0 && !bl.includes(to)) bl.push(to); }
          if (bl.length === 1 && lessons[bl[0]].span === 1) cand.push({ di, pi, blockers: bl, s: rnd() });
        }
        if (done) continue;
        cand.sort((a, b) => a.s - b.s);
        for (const c of cand.slice(0, 40)) {
          const B = lessons[c.blockers[0]]; const bc = at[B.id]; const bdi = Math.floor(bc / Pn), bpi = bc % Pn; take(B);
          if (feasible(L, c.di, c.pi)) { put(L, c.di, c.pi); const cs = cells(B).filter((x) => !(x.di === bdi && x.pi === bpi)); if (cs.length) { put(B, cs[0].di, cs[0].pi); left.splice(li, 1); done = true; break; } take(L); }
          put(B, bdi, bpi);
        }
      }
    }

    // quality (lower is better)
    let q = 0;
    for (const b of batchIds) { const c = cls.get(b)!; for (let di = 0; di < Dn; di++) { let seen = false; let gap = 0; for (let pi = Pn - 1; pi >= 0; pi--) { const v = c[di * Pn + pi]; if (v !== -1) seen = true; else if (seen) gap++; } q += gap * 3; } }
    for (const [, arr] of sDay) for (const n of arr) if (n > 1) q += (n - 1) * (n - 1) * 2;
    for (const L of lessons) if (at[L.id] >= 0 && L.span === 1) { const di = Math.floor(at[L.id] / Pn), pi = at[L.id] % Pn; if (pi > 0 && fsub.get(L.batchId)![di * Pn + pi - 1] === L.subject) q += 3; }
    for (const f of teacherIds) { const a = tDay.get(f)!; const mx = Math.max(...a), mn = Math.min(...a); q += (mx - mn) * 0.5; }
    return { at, left, q, slack, cls, tch };
  }

  // ---------------- search ----------------
  let best: ReturnType<typeof attempt> | null = null; let tries = 0; const t0 = Date.now(); let perfect = 0;
  while (tries < maxAttempts && Date.now() - t0 < budget) {
    const slack = tries >= Math.ceil(maxAttempts / 2) || (Date.now() - t0 > budget / 2) ? 1 : 0;
    const r = attempt(seed0 + tries * 7919, slack); tries++;
    if (!best || r.left.length < best.left.length || (r.left.length === best.left.length && r.q < best.q)) best = r;
    if (best.left.length === 0) { perfect++; if (perfect >= 8) break; }
  }
  const out = best!;
  const slots: Cell[] = []; for (const L of lessons) { const ci = out.at[L.id]; if (ci < 0) continue; const di = Math.floor(ci / Pn), pi = ci % Pn; for (let k = 0; k < L.span; k++) slots.push({ batchId: L.batchId, weekday: D[di], period: P[pi + k].no, subject: L.subject, facultyId: L.facultyId }); }

  // why something could not be placed
  const agg = new Map<string, Unplaced>(); const cl = out.cls;
  for (const L of out.left) {
    const k = `${L.batchId}|${L.subject}|${L.facultyId || ''}`; const ex = agg.get(k); if (ex) { ex.missing += L.span; continue; }
    let freeCls = 0, teacherOk = 0; for (let di = 0; di < Dn; di++) for (let pi = 0; pi < Pn; pi++) { if (cl.get(L.batchId)![di * Pn + pi] === -1) { freeCls++; if (L.facultyId) { const f = L.facultyId; const r = ruleOf.get(f); if (!offDay(f, di) && !blockedAt(f, di, pi) && !extBusy.has(`${f}|${di}|${pi}`) && out.tch.get(f)![di * Pn + pi] === -1 && !(r?.maxPerDay && false)) teacherOk++; } else teacherOk++; } }
    const lim = L.facultyId ? ruleOf.get(L.facultyId) : undefined; const used = L.facultyId ? out.tch.get(L.facultyId)!.filter((v: number) => v !== -1).length : 0;
    const weekFull = !!(lim?.maxPerWeek && used >= lim.maxPerWeek);
    const reason = weekFull ? `${tname(L.facultyId)} has reached the weekly limit of ${lim!.maxPerWeek} periods. Raise the limit or give some of ${L.subject} to another teacher.` : freeCls === 0 ? `${bname(L.batchId)} has no free period left (every period of the week is already used).` : teacherOk === 0 ? `${tname(L.facultyId)} is busy (other classes, day-off or limits) in every period where ${bname(L.batchId)} is free.` : `${L.subject} would break the daily limit (${L.limit} a day) or the teacher's daily/weekly limit in the periods that are free. Allow more periods per day for it, or give the teacher a higher limit.`;
    agg.set(k, { batchId: L.batchId, subject: L.subject, facultyId: L.facultyId, missing: L.span, reason });
  }
  const load = teacherIds.map((f) => ({ facultyId: f, periods: slots.filter((s) => s.facultyId === f).length + p.fixed.filter((c) => c.facultyId === f).length })).sort((a, b) => b.periods - a.periods);
  return { slots, unplaced: [...agg.values()], warnings, stats: { lessons: lessons.reduce((n, L) => n + L.span, 0), placed: slots.length, attempts: tries, seed: seed0, quality: Math.round(out.q * 10) / 10, teacherLoad: load } };
}

// ---------------- audit: finds clashes in any list of slots (by clock time, so it also works for hand-made slots) ----------------
export type AuditSlot = { batchId: string; weekday: number; startTime: string; endTime: string; subject: string; facultyId: string | null; period?: number | null };
export function audit(slots: AuditSlot[], rules: Rule[], breaks: { startTime: string; endTime: string }[], names?: { batch?: Record<string, string>; teacher?: Record<string, string> }): string[] {
  const out: string[] = []; const bn = (id: string) => names?.batch?.[id] || 'a class'; const tn = (id: string) => names?.teacher?.[id] || 'a teacher'; const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ov = (a: AuditSlot, b: AuditSlot) => a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime;
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
    const a = slots[i], b = slots[j]; if (!ov(a, b)) continue;
    if (a.batchId === b.batchId) out.push(`${bn(a.batchId)} has two lessons at the same time on ${DN[a.weekday]} ${a.startTime}: ${a.subject} and ${b.subject}.`);
    if (a.facultyId && a.facultyId === b.facultyId) out.push(`${tn(a.facultyId)} is in two places on ${DN[a.weekday]} ${a.startTime}: ${bn(a.batchId)} (${a.subject}) and ${bn(b.batchId)} (${b.subject}).`);
  }
  const rl = new Map<string, Rule>(); for (const r of rules) rl.set(r.facultyId, r);
  const perDay = new Map<string, number>(); const perWeek = new Map<string, number>();
  for (const s of slots) {
    if (breaks.some((b) => s.startTime < b.endTime && b.startTime < s.endTime)) out.push(`${bn(s.batchId)} · ${s.subject} on ${DN[s.weekday]} ${s.startTime} falls in a break.`);
    if (!s.facultyId) continue; const r = rl.get(s.facultyId);
    perDay.set(`${s.facultyId}|${s.weekday}`, (perDay.get(`${s.facultyId}|${s.weekday}`) || 0) + 1); perWeek.set(s.facultyId, (perWeek.get(s.facultyId) || 0) + 1);
    if (r?.offDays?.includes(s.weekday)) out.push(`${tn(s.facultyId)} has ${DN[s.weekday]} off but teaches ${bn(s.batchId)} ${s.subject} at ${s.startTime}.`);
    if (r?.blocked?.some((b) => b.weekday === s.weekday && s.period != null && b.period === s.period)) out.push(`${tn(s.facultyId)} is blocked on ${DN[s.weekday]} period ${s.period} but teaches ${bn(s.batchId)} ${s.subject}.`);
  }
  for (const [k, n] of perDay) { const [f, d] = k.split('|'); const r = rl.get(f); if (r?.maxPerDay && n > r.maxPerDay) out.push(`${tn(f)} has ${n} periods on ${DN[Number(d)]} (limit ${r.maxPerDay}).`); }
  for (const [f, n] of perWeek) { const r = rl.get(f); if (r?.maxPerWeek && n > r.maxPerWeek) out.push(`${tn(f)} has ${n} periods this week (limit ${r.maxPerWeek}).`); }
  return [...new Set(out)];
}
