/** Pure helpers for the activity log: what is worth recording, how it reads in plain words, and which log it belongs to (a client's or the platform's). */

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Not worth a line: chat messages, push registration, notification reads, the biometric machine's own pushes, assistant questions, live location pings, sign-in (has its own record), PDF link tokens
const NOISE = /^\/(chat|notifications|iclock|assistant|transport\/location|auth\/|wishes\/seen)/;
export function loggable(method: string, path: string): boolean { return WRITE.has(String(method).toUpperCase()) && !NOISE.test(path); }

export const AREAS: Record<string, string> = {
  students: 'Students', batches: 'Classes', attendance: 'Attendance', fees: 'Fees', notices: 'Notices', content: 'Study material', timetable: 'Timetable', library: 'Library', tests: 'Online tests',
  homework: 'Homework', houses: 'Houses', staff: 'Staff', exams: 'Exams', records: 'Records', files: 'Files', biometric: 'Biometric', payroll: 'Payroll', 'staff-attendance': 'Staff attendance',
  leaves: 'Leaves', enquiries: 'Enquiries', admissions: 'Admissions', certificates: 'Certificates', idcards: 'ID cards', import: 'Import', messaging: 'Messaging', wellbeing: 'Wellbeing', news: 'News',
  transport: 'Transport', doubts: 'Doubts', feedback: 'Feedback', live: 'Live classes', workspace: 'Workspace', centres: 'Centre settings', subscription: 'Subscription', payments: 'Payments', platform: 'Platform',
  'recycle-bin': 'Recycle bin', backup: 'Backup', access: 'Access & security', alerts: 'Alerts', wishes: 'Wishes', insights: 'Reports', reports: 'Reports', dashboard: 'Dashboard', login: 'Sign-in',
};
const VERBS: Record<string, string> = {
  delete: 'Deleted', paid: 'Marked paid', void: 'Voided', restore: 'Restored', erase: 'Erased for good', send: 'Sent', publish: 'Published', approve: 'Approved', reject: 'Rejected', assign: 'Assigned',
  reactivate: 'Brought back', deactivate: 'Deactivated', invoice: 'Raised an invoice', suspend: 'Suspended', activate: 'Activated', reset: 'Reset', import: 'Imported', 'bulk-delete': 'Deleted',
  upload: 'Uploaded', mark: 'Marked', save: 'Saved', generate: 'Generated', 'demo-switch': 'Looked through another login', 'demo-back': 'Came back to own login',
};
const BASE: Record<string, string> = { POST: 'Added', PUT: 'Edited', PATCH: 'Edited', DELETE: 'Deleted' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nice = (s: string) => s.replace(/[-_]/g, ' ');

/** Only these fields of a request are ever copied into the log, so no password, OTP, key or token can land there. */
const LABEL_KEYS = ['name', 'title', 'subject', 'className', 'label', 'receiptNo', 'code', 'confirmName', 'studentName', 'amount'];
export function detailOf(body: any): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
  const parts: string[] = [];
  for (const k of LABEL_KEYS) { const v = body[k]; if (typeof v === 'string' && v.trim()) parts.push(v.trim()); else if (typeof v === 'number' && k === 'amount') parts.push(`₹${v}`); if (parts.length >= 2) break; }
  return parts.join(' · ').replace(/[\u0000-\u001f]/g, ' ').slice(0, 120);
}

export function describe(method: string, path: string, body?: any): { area: string; action: string; detail: string } {
  const m = String(method).toUpperCase(); const segs = path.split('?')[0].split('/').filter(Boolean); const first = segs[0] || '';
  if (m === 'VIEW') return { area: 'Support', action: 'Looked at the students and teachers list', detail: '' };
  const area = AREAS[first] || nice(first) || 'Other';
  const rest = segs.slice(1).filter((s) => !UUID.test(s));
  const verbWord = [...rest].reverse().find((s) => VERBS[s]);
  const sub = rest.filter((s) => !VERBS[s] && !/^\d+$/.test(s)).map(nice).join(' › ');
  const verb = (verbWord && VERBS[verbWord]) || BASE[m] || m;
  return { area, action: `${verb} · ${area}${sub ? ' › ' + sub : ''}`, detail: detailOf(body) };
}

/** Which log a change belongs to: inside a client (support mode counts as that client), or the platform's own work. */
export function scopeOf(u: { role?: string; centreId?: string | null; support?: boolean }, path: string): { scope: 'client' | 'platform'; centreId: string | null } {
  if (u.role === 'SUPER_ADMIN' && !u.support) { const m = path.match(/^\/platform\/centres\/([0-9a-f-]{36})(\/|$)/i); return { scope: 'platform', centreId: m ? m[1] : null }; }
  return { scope: 'client', centreId: u.centreId || null };
}

/** Removing a whole client deletes that client's log lines with it, so this one line is kept on the platform side with the name in it. */
export function survivesClient(path: string) { return /^\/platform\/centres\/[^/]+\/delete$/.test(path) || path === '/platform/centres/purge-non-demo'; }
