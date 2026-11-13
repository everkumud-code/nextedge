/** Which home screen a person gets after login. Pure, so it can be self-tested. */
export type DashKind = 'admin' | 'teacher' | 'student' | 'parent' | 'driver' | 'frontoffice' | 'hr' | 'accounts' | 'staff';

/**
 * Students, parents, teachers and the owner are decided by their login role. Other staff (role STAFF) are told apart by the job title
 * the owner wrote for them (Privileges), because a school does not have a separate login type for a driver or an accountant:
 * title words such as driver, accountant / cashier, HR, front office / receptionist; anyone else is general non-teaching staff.
 */
export function dashKind(role: string, title?: string | null): DashKind {
  if (role === 'STUDENT') return 'student'; if (role === 'PARENT') return 'parent'; if (role === 'FACULTY') return 'teacher';
  if (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'EXPERT') return 'admin';
  const t = String(title || '').toLowerCase();
  if (/\b(driver|bus|transport|conductor)\b/.test(t)) return 'driver';
  if (/\b(hr|human resources?|personnel)\b/.test(t)) return 'hr';
  if (/\b(account|accounts|accountant|cashier|finance|fees?)\b/.test(t)) return 'accounts';
  if (/\b(front|reception|receptionist|office|desk|admission)\b/.test(t)) return 'frontoffice';
  return 'staff';
}

/** Consecutive present days counted backwards from the latest marked day (late counts as present; a leave day does not break nor add). */
export function presentStreak(days: { date: string; status: string }[]): number {
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date)); let n = 0;
  for (const d of sorted) { if (d.status === 'LEAVE') continue; if (d.status === 'PRESENT' || d.status === 'LATE') n++; else break; }
  return n;
}
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
