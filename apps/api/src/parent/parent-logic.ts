/** Pure helpers for the parent portal (no database), so they can be tested on their own. */

export type Alert = { level: 'bad' | 'warn' | 'info' | 'good'; text: string; to: string };
type Day = { date: string; status: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | string };

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || 'Your child';
const dshort = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The short list of things that need a parent's attention today, most urgent first. Nothing to do = a good-news line, so the screen is never empty. */
export function buildAlerts(a: {
  name: string; today: string; days: Day[];
  homework: { title: string; subject: string; dueAt: string }[];
  exams: { name: string; date: string | null; published: boolean }[];
  booksOverdue: number; balance: number;
  leaves: { status: string; fromDate: string; toDate: string }[];
}): Alert[] {
  const n = first(a.name); const out: Alert[] = []; const month = a.today.slice(0, 7);
  if (a.balance > 0) out.push({ level: 'warn', text: `${inr(a.balance)} fees are due for ${n}.`, to: '/p/fees' });
  const todayRow = a.days.find((d) => d.date === a.today);
  if (todayRow?.status === 'ABSENT') out.push({ level: 'bad', text: `${n} is marked absent today.`, to: '/p/attendance' });
  const m = a.days.filter((d) => d.date.startsWith(month) && d.status !== 'LEAVE');
  if (m.length >= 5) { const pct = Math.round((m.filter((d) => d.status === 'PRESENT' || d.status === 'LATE').length / m.length) * 100); if (pct < 75) out.push({ level: 'bad', text: `${n}'s attendance this month is ${pct}%, below the 75% most boards expect.`, to: '/p/attendance' }); }
  const overdue = a.homework.filter((h) => h.dueAt < new Date(Date.parse(a.today + 'T00:00:00+05:30')).toISOString());
  if (overdue.length) out.push({ level: 'warn', text: `${overdue.length} homework ${overdue.length === 1 ? 'is' : 'items are'} overdue for ${n}${overdue[0].subject ? ` (${overdue[0].subject}${overdue.length > 1 ? ' and more' : ''})` : ''}.`, to: '/p/homework' });
  else { const soon = a.homework.filter((h) => h.dueAt.slice(0, 10) <= addDay(a.today, 2)); if (soon.length) out.push({ level: 'info', text: `${soon.length} homework due in the next two days: ${soon[0].title}${soon.length > 1 ? ' and more' : ''}.`, to: '/p/homework' }); }
  const nextExam = a.exams.filter((e) => e.date && e.date >= a.today && e.date <= addDay(a.today, 7)).sort((x, y) => String(x.date).localeCompare(String(y.date)))[0];
  if (nextExam?.date) out.push({ level: 'info', text: `${nextExam.name} starts on ${dshort(nextExam.date)}.`, to: '/p/progress' });
  const fresh = a.exams.filter((e) => e.published && e.date && e.date <= a.today && e.date >= addDay(a.today, -21)).sort((x, y) => String(y.date).localeCompare(String(x.date)))[0];
  if (fresh) out.push({ level: 'good', text: `The result of ${fresh.name} is out for ${n}.`, to: '/p/progress' });
  if (a.booksOverdue > 0) out.push({ level: 'warn', text: `${a.booksOverdue} library ${a.booksOverdue === 1 ? 'book is' : 'books are'} overdue for ${n}.`, to: '/p/more' });
  const decided = a.leaves.find((l) => l.status === 'approved' || l.status === 'rejected');
  if (decided) out.push({ level: 'info', text: `Leave for ${dshort(decided.fromDate)}${decided.toDate !== decided.fromDate ? ' to ' + dshort(decided.toDate) : ''} was ${decided.status}.`, to: '/p/attendance' });
  const rank = { bad: 0, warn: 1, info: 2, good: 3 } as const; out.sort((x, y) => rank[x.level] - rank[y.level]);
  return out.length ? out : [{ level: 'good', text: `Nothing needs your attention for ${n} today.`, to: '/' }];
}
function addDay(d: string, n: number) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }

/** Attendance by month for the last six months (newest first). LEAVE days are not counted against the percentage. */
export function monthRows(days: Day[], today: string) {
  const months: string[] = []; const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
  for (let i = 0; i < 6; i++) { const d = new Date(Date.UTC(y, mo - 1 - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  return months.map((month) => {
    const r = days.filter((d) => String(d.date).startsWith(month)); const c = (s: string) => r.filter((d) => d.status === s).length;
    const marked = r.filter((d) => d.status !== 'LEAVE').length; const present = c('PRESENT') + c('LATE');
    return { month, present: c('PRESENT'), late: c('LATE'), absent: c('ABSENT'), leave: c('LEAVE'), marked, pct: marked ? Math.round((present / marked) * 100) : null };
  }).filter((m) => m.present + m.late + m.absent + m.leave > 0);
}

type Slot = { weekday: number; start: string; end: string; subject: string; room: string | null; period: number | null; teacher: string | null };
/** The week Monday to Saturday (Sunday only if it has classes). A class that has period-grid slots shows only those, the same rule the home screen uses. */
export function weekOf(slots: Slot[]) {
  const grid = slots.some((s) => s.period !== null); const use = grid ? slots.filter((s) => s.period !== null) : slots;
  const order = [1, 2, 3, 4, 5, 6, 0]; const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return order.map((wd) => ({ weekday: wd, name: names[wd], periods: use.filter((s) => s.weekday === wd).sort((a, b) => a.start.localeCompare(b.start)).map((s) => ({ start: s.start, end: s.end, subject: s.subject, teacher: s.teacher || '', room: s.room || '' })) })).filter((d) => d.weekday !== 0 || d.periods.length);
}
