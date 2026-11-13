/** Untangling a timetable in which one teacher has two classes at overlapping times. Pure (no database), so it can be self-tested. */
export type Slot = { id: string; facultyId: string | null; weekday: number; startTime: string; endTime: string; subject: string };
export type Teacher = { id: string; title?: string | null };
const overlap = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * Returns the changes needed so that no teacher is in two classes at once: [{ id, facultyId }] where facultyId is a free teacher
 * (one whose title mentions the subject is preferred, otherwise the one with the lightest day) or null when nobody is free.
 * Slots are kept in the order given (earlier slots win), so running it on an already clean timetable returns nothing.
 */
export function repairClashes(slots: Slot[], teachers: Teacher[]): { id: string; facultyId: string | null }[] {
  const busy = new Map<string, Slot[]>(); const keep = (t: string, s: Slot) => { const k = `${t}|${s.weekday}`; busy.set(k, [...(busy.get(k) || []), s]); };
  const freeFor = (t: string, s: Slot) => !(busy.get(`${t}|${s.weekday}`) || []).some((x) => overlap(x, s));
  const out: { id: string; facultyId: string | null }[] = [];
  const ordered = [...slots].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
  for (const s of ordered) {
    if (!s.facultyId) continue;
    if (freeFor(s.facultyId, s)) { keep(s.facultyId, s); continue; }
    const word = (s.subject.match(/[A-Za-z]{4,}/) || [''])[0].toLowerCase(); const cands = teachers.filter((t) => t.id !== s.facultyId && freeFor(t.id, s));
    const load = (t: Teacher) => (busy.get(`${t.id}|${s.weekday}`) || []).length; const liked = word ? cands.filter((t) => String(t.title || '').toLowerCase().includes(word.slice(0, 4))) : [];
    const pick = [...(liked.length ? liked : cands)].sort((a, b) => load(a) - load(b) || a.id.localeCompare(b.id))[0];
    if (pick) { keep(pick.id, s); out.push({ id: s.id, facultyId: pick.id }); } else out.push({ id: s.id, facultyId: null });
  }
  return out;
}

/** Every pair of overlapping slots that share a teacher (for tests and checks). */
export function findClashes(slots: Slot[]): [Slot, Slot][] {
  const out: [Slot, Slot][] = []; const by = new Map<string, Slot[]>(); for (const s of slots) if (s.facultyId) by.set(`${s.facultyId}|${s.weekday}`, [...(by.get(`${s.facultyId}|${s.weekday}`) || []), s]);
  for (const g of by.values()) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (overlap(g[i], g[j])) out.push([g[i], g[j]]);
  return out;
}
