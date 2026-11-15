/**
 * Deleting is the one thing that cannot be taken back by clicking again, so it is handled in one place.
 *  - Only the platform owner deletes client data. A client's own people (owner, teacher, staff, sales) and the platform team can add and edit, not delete.
 *    (DESTRUCTIVE_POLICY=approval lets a client's own people delete too; then the copy waits in the Recycle bin until the owner approves erasing it.)
 *  - Whatever is deleted, a database trigger keeps a copy in the Recycle bin until the owner approves erasing it for good (see recycle/recycle.service.ts).
 * These routes are NOT deletes of data in that sense: they switch something off or take a link away, and can be switched back on.
 */
const SAFE = [
  /^\/api\/students\/[^/]+$/, // a student who leaves is switched off (active = false) and can be switched back on; nothing is erased
  /^\/api\/transport\/location\/mine$/, // a driver stops sharing the bus location
  /^\/api\/(subscription|platform)\/coupon$/, // an owner takes a coupon code off their own bill
  /^\/api\/timetable\/(substitutions\/)?[^/]+$/, // timetable slots and substitutions are re-made all the time
  /^\/api\/batches\/[^/]+\/faculty\/[^/]+$/, // un-assigning a teacher from a class
  /^\/api\/houses\/roles\/[^/]+$/, // un-assigning a house role
];
/** True for a DELETE that removes stored data. */
export function isDestructive(method: string, url: string): boolean {
  if (String(method).toUpperCase() !== 'DELETE') return false;
  const path = String(url || '').split('?')[0].replace(/\/+$/, '');
  return !SAFE.some((r) => r.test(path));
}
/** Tables whose deleted rows are kept in the Recycle bin. People, money and school records; not logs, tokens, live locations or attendance re-marks. */
export const RECYCLED_TABLES = [
  'students', 'batches', 'fee_payments', 'student_fee_plans', 'fee_plans', 'exams', 'exam_marks', 'records', 'files', 'content',
  'houses', 'house_points', 'house_roles', 'timetable_slots', 'substitutions', 'faculty_batches', 'biometric_devices',
] as const;
