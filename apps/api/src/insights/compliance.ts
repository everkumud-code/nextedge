/**
 * Board-compliance checks for a school. Pure functions (no database) so they can be self-tested.
 * These are SOFTWARE HELP, not legal advice: every number below is taken from the board's public
 * guidance as understood in Nov 2026 and each check says where it comes from. The school must still
 * follow the board's latest circular; limits can be changed in one place (LIMITS).
 */
export type Board = 'CBSE' | 'CISCE' | 'STATE' | 'OTHER';

export const LIMITS = {
  /** CBSE affiliation bye-laws: 40 students a section is the norm (45 is the outer figure some circulars allow). */
  sectionWarn: 40, sectionHigh: 45,
  /** CBSE affiliation bye-laws: 30 students per teacher, and at least 1.5 teachers per section. */
  pupilTeacher: 30, teachersPerSection: 1.5,
  /** CBSE: 75% attendance to be eligible for the Class X / XII board examination (condonation up to a further 25% needs documented reasons). */
  attendanceMin: 75,
  /** Do not judge attendance before this many marked days — the figure is meaningless early in the session. */
  attendanceMinDays: 20,
} as const;

export function normBoard(text?: string | null): Board {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return 'OTHER';
  if (/cbse|central board of secondary/.test(t)) return 'CBSE';
  if (/icse|isc\b|cisce|council for the indian school/.test(t)) return 'CISCE';
  if (/state|jac\b|jcert|bseb|bihar|jharkhand|up board|mp board|rbse|maharashtra|wbbse/.test(t)) return 'STATE';
  return 'OTHER';
}

/** "Class 10-A", "X", "9th", "IX", "XII Science" → 10, 10, 9, 9, 12. Nursery / LKG etc. → null. */
export function classNo(name?: string | null): number | null {
  const t = String(name || '').trim().toUpperCase();
  const d = t.match(/(?:^|[^0-9])(1[0-2]|[1-9])(?:ST|ND|RD|TH)?(?:[^0-9]|$)/);
  if (d) return Number(d[1]);
  const romans: Record<string, number> = { XII: 12, XI: 11, X: 10, IX: 9, VIII: 8, VII: 7, VI: 6, V: 5, IV: 4, III: 3, II: 2, I: 1 };
  const r = t.match(/(?:^|[^A-Z])(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?:[^A-Z]|$)/);
  return r ? romans[r[1]] : null;
}

export const isApaar = (s?: string | null) => /^\d{12}$/.test(String(s || '').replace(/[\s-]/g, ''));
export const isPen = (s?: string | null) => /^\d{11}$/.test(String(s || '').replace(/[\s-]/g, ''));
/** APAAR / PEN are stored as digits only. */
export const digits = (s?: string | null) => String(s || '').replace(/[\s-]/g, '');
/** Values meaning "the family has been asked and has declined / it is not made yet" — recorded so the school is not nagged forever. */
export const isNoted = (s?: string | null) => /^(refused|declined|not generated|na|n\/a|pending)$/i.test(String(s || '').trim());

/** Clean an APAAR / PEN typed by staff: digits only, or a note word such as "refused". Returns null for blank, throws for anything else. */
export function cleanId(kind: 'APAAR' | 'PEN', v?: string | null): string | null {
  const t = String(v ?? '').trim(); if (!t) return null; if (isNoted(t)) return t.toLowerCase();
  const d = digits(t); const ok = kind === 'APAAR' ? isApaar(d) : isPen(d);
  if (!ok) throw new Error(kind === 'APAAR' ? 'APAAR ID must be 12 digits (or write "refused" / "not generated")' : 'PEN must be 11 digits (or write "refused" / "not generated")');
  return d;
}

export type CStudent = { id: string; name: string; className?: string | null; section?: string | null; dob?: string | null; gender?: string | null; fatherName?: string | null; motherName?: string | null; category?: string | null; apaarId?: string | null; pen?: string | null; admissionNo?: string | null };
export type CSection = { id: string; label: string; className?: string | null; strength: number };
export type CInput = {
  board: Board; profile: { academicSession?: string | null; affiliationNo?: string | null; udiseCode?: string | null; principalName?: string | null; board?: string | null };
  sections: CSection[]; teachers: number; students: CStudent[];
  /** Per student: days marked present (incl. late) and total marked days (leave counted as absent). */
  attendance: Record<string, { present: number; total: number }>;
};
export type Check = { key: string; title: string; status: 'ok' | 'warn' | 'fail' | 'info'; detail: string; source: string; total: number; items: string[] };

const cap = (a: string[], n = 60) => a.slice(0, n);
const label = (s: CStudent) => `${s.name}${s.className ? ` (${s.className}${s.section ? '-' + s.section : ''})` : ''}`;

export function audit(inp: CInput): { board: Board; checks: Check[]; counts: { ok: number; warn: number; fail: number } } {
  const checks: Check[] = []; const { board } = inp; const push = (c: Check) => checks.push(c);
  const cbse = board === 'CBSE';

  // 1. school profile
  const missing = [!inp.profile.board && 'Board', !inp.profile.affiliationNo && 'Affiliation number', !inp.profile.udiseCode && 'UDISE code', !inp.profile.principalName && 'Principal name', !inp.profile.academicSession && 'Academic session'].filter(Boolean) as string[];
  push({ key: 'profile', title: 'School profile is complete', status: missing.length ? 'warn' : 'ok', detail: missing.length ? `Fill these in School profile — they are printed on certificates and report cards: ${missing.join(', ')}.` : 'Board, affiliation number, UDISE code, principal and session are all filled.', source: 'Printed on every TC and report card', total: missing.length, items: missing });

  // 2. section size (CBSE only: the numeric norm is from the CBSE affiliation bye-laws)
  if (cbse) {
    const over = inp.sections.filter((s) => s.strength > LIMITS.sectionWarn).sort((a, b) => b.strength - a.strength);
    const high = over.filter((s) => s.strength > LIMITS.sectionHigh);
    push({ key: 'section-size', title: `Students per section (norm ${LIMITS.sectionWarn})`, status: high.length ? 'fail' : over.length ? 'warn' : 'ok', detail: over.length ? `${over.length} section(s) have more than ${LIMITS.sectionWarn} students${high.length ? `, ${high.length} of them more than ${LIMITS.sectionHigh}` : ''}. Split the section or recheck the strength.` : `No section is above ${LIMITS.sectionWarn} students.`, source: 'CBSE affiliation bye-laws (check the latest circular)', total: over.length, items: cap(over.map((s) => `${s.label}: ${s.strength} students`)) });

    const secs = inp.sections.filter((s) => s.strength > 0).length; const t = inp.teachers; const ratio = t ? inp.students.length / t : Infinity;
    const probs: string[] = []; if (!t) probs.push('No teacher is added yet.'); else { if (ratio > LIMITS.pupilTeacher) probs.push(`${inp.students.length} students for ${t} teachers is ${ratio.toFixed(1)} per teacher (norm ${LIMITS.pupilTeacher}).`); if (secs && t < secs * LIMITS.teachersPerSection) probs.push(`${t} teachers for ${secs} sections; the norm is ${LIMITS.teachersPerSection} teachers per section (${Math.ceil(secs * LIMITS.teachersPerSection)} needed).`); }
    push({ key: 'teachers', title: 'Teachers for the number of students', status: probs.length ? 'warn' : 'ok', detail: probs.length ? probs.join(' ') : `${inp.students.length} students, ${t} teachers (${ratio.toFixed(1)} per teacher), ${secs} sections.`, source: 'CBSE affiliation bye-laws; counts only teacher logins (Faculty)', total: probs.length, items: probs });
  } else {
    push({ key: 'section-size', title: 'Students per section', status: 'info', detail: board === 'CISCE' ? 'The CISCE class-size limit is not built in, because we could not confirm an official figure. Set each section’s capacity in Classes & sections.' : 'Set each section’s capacity in Classes & sections. A board-specific limit is built in for CBSE schools only.', source: '—', total: 0, items: [] });
  }

  // 3. attendance
  const senior = inp.students.filter((s) => { const n = classNo(s.className); return n !== null && n >= 9; });
  const low: string[] = []; let judged = 0;
  for (const s of senior) { const a = inp.attendance[s.id]; if (!a || a.total < LIMITS.attendanceMinDays) continue; judged++; const pct = (a.present / a.total) * 100; if (pct < LIMITS.attendanceMin) low.push(`${label(s)}: ${pct.toFixed(0)}% (${a.present}/${a.total} days)`); }
  push({ key: 'attendance', title: `Attendance below ${LIMITS.attendanceMin}% in Classes IX–XII`, status: low.length ? 'warn' : 'ok', detail: low.length ? `${low.length} student(s) are below ${LIMITS.attendanceMin}%. For the board examination, CBSE expects ${LIMITS.attendanceMin}% attendance; shortage can be condoned only with documented reasons. Inform the parents in writing now.` : `${judged} senior student(s) with enough marked days; none below ${LIMITS.attendanceMin}%. Approved leave counts as absent here.`, source: 'CBSE examination bye-laws (75% rule); other boards have similar rules', total: low.length, items: cap(low) });

  // 4. APAAR / PEN formats and readiness for LOC (Classes IX–XII)
  const bad: string[] = []; for (const s of inp.students) { if (s.apaarId && !isApaar(s.apaarId) && !isNoted(s.apaarId)) bad.push(`${label(s)}: APAAR “${s.apaarId}” is not 12 digits`); if (s.pen && !isPen(s.pen) && !isNoted(s.pen)) bad.push(`${label(s)}: PEN “${s.pen}” is not 11 digits`); }
  push({ key: 'id-format', title: 'APAAR ID and PEN written correctly', status: bad.length ? 'fail' : 'ok', detail: bad.length ? 'Correct these before sending data to the board; a wrong digit makes the match fail.' : 'Every APAAR ID / PEN that is filled looks correctly formatted (APAAR = 12 digits, PEN = 11 digits).', source: 'APAAR (One Nation One Student ID) and PEN formats', total: bad.length, items: cap(bad) });

  const notReady: string[] = [];
  for (const s of senior) { const m = [!s.dob && 'date of birth', !s.fatherName && 'father’s name', !s.motherName && 'mother’s name', !s.gender && 'gender', !s.category && 'category', !(isApaar(s.apaarId) || isNoted(s.apaarId)) && 'APAAR ID'].filter(Boolean); if (m.length) notReady.push(`${label(s)}: ${m.join(', ')}`); }
  push({ key: 'loc', title: 'List of Candidates (LOC) readiness, Classes IX–XII', status: notReady.length ? 'warn' : 'ok', detail: notReady.length ? `${notReady.length} of ${senior.length} senior students have details missing that the board asks for when registering / listing candidates. Write “refused” or “not generated” in APAAR if the family has declined or it is not made yet, so it stops showing here.` : `All ${senior.length} senior students have the details the board asks for.`, source: 'CBSE registration / LOC data (name, parents, date of birth, APAAR); check the board’s current notice', total: notReady.length, items: cap(notReady) });

  const noApaar = inp.students.filter((s) => !s.apaarId).length;
  push({ key: 'apaar-all', title: 'APAAR ID collected', status: noApaar ? 'info' : 'ok', detail: noApaar ? `${noApaar} of ${inp.students.length} students have no APAAR ID yet. It is created with the parent’s consent; it cannot be forced.` : 'Every student has an APAAR ID or a note.', source: 'Ministry of Education APAAR guidance (consent-based)', total: noApaar, items: [] });

  const counts = { ok: checks.filter((c) => c.status === 'ok').length, warn: checks.filter((c) => c.status === 'warn').length, fail: checks.filter((c) => c.status === 'fail').length };
  return { board, checks, counts };
}

/** Number of words for a date, as the TC asks "date of birth in words". 2012-03-05 → "Fifth March Two Thousand Twelve". */
export function dateInWords(iso?: string | null): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const below100 = (n: number) => (n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''));
  const ord = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth', 'Twenty First', 'Twenty Second', 'Twenty Third', 'Twenty Fourth', 'Twenty Fifth', 'Twenty Sixth', 'Twenty Seventh', 'Twenty Eighth', 'Twenty Ninth', 'Thirtieth', 'Thirty First'];
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]); if (!ord[d] || !months[mo]) return '';
  const th = Math.floor(y / 1000); const rest = y % 1000; const h = Math.floor(rest / 100); const r = rest % 100;
  const year = [th ? `${ones[th]} Thousand` : '', h ? `${ones[h]} Hundred` : '', r ? (h || th ? 'and ' : '') + below100(r) : ''].filter(Boolean).join(' ');
  return `${ord[d]} ${months[mo]} ${year}`;
}
