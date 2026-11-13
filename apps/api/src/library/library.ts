/** Library rules (pure functions, no database, so they can be self-tested). Money is in whole rupees. */

const DAY = 864e5;
/** Whole days between two YYYY-MM-DD dates (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY).toISOString().slice(0, 10);

/** Days a book is late: counted from the day after the due date until it came back (or until today if it is still out). Never negative. */
export const daysLate = (due: string, returnedOn: string | null | undefined, today: string) => Math.max(0, daysBetween(due, returnedOn || today));

export type FineInput = { dueDate: string; returnedOn?: string | null; today: string; finePerDay: number; /** the book's own value (price), charged when it is lost */ value: number; lost?: boolean; damagedCharge?: number; waive?: boolean };
/** What the student owes for one loan: late fine (per day) and, if the book is lost, the value of the book. A damaged book can carry an extra charge the librarian types. */
export function amountsFor(i: FineInput): { late: number; days: number; lostCharge: number; damaged: number; total: number } {
  const days = daysLate(i.dueDate, i.lost ? null : i.returnedOn, i.today); const late = i.waive ? 0 : Math.round(days * Math.max(0, i.finePerDay));
  const lostCharge = i.lost ? Math.round(Math.max(0, i.value)) : 0; const damaged = Math.round(Math.max(0, i.damagedCharge || 0));
  return { late, days, lostCharge, damaged, total: late + lostCharge + damaged };
}

/** Copies on the shelf = copies owned minus loans still out (issued, overdue). A lost or returned loan does not hold a copy. */
export const availableCopies = (copies: number, outNow: number) => Math.max(0, Math.round(copies || 0) - outNow);

/** Cleans what the librarian typed for a book. */
export function cleanBook(b: any): { error: string } | { ok: { title: string; author: string; publisher: string; category: string; isbn: string; shelf: string; copies: number; value: number; finePerDay: number | null } } {
  const title = String(b?.title ?? '').trim().slice(0, 160); if (!title) return { error: 'Enter the book name.' };
  const copies = b?.copies === '' || b?.copies == null ? 1 : Number(b.copies); if (!(Number.isInteger(copies) && copies >= 0 && copies <= 9999)) return { error: 'Copies must be a whole number.' };
  const value = b?.value === '' || b?.value == null ? 0 : Number(b.value); if (!(value >= 0)) return { error: 'The value of the book cannot be negative.' };
  const fpd = b?.finePerDay === '' || b?.finePerDay == null ? null : Number(b.finePerDay); if (fpd !== null && !(fpd >= 0)) return { error: 'The fine per day cannot be negative.' };
  const t = (k: string, n = 100) => String(b?.[k] ?? '').trim().slice(0, n);
  return { ok: { title, author: t('author'), publisher: t('publisher'), category: t('category', 60), isbn: t('isbn', 40), shelf: t('shelf', 40), copies, value: Math.round(value), finePerDay: fpd === null ? null : Math.round(fpd) } };
}
