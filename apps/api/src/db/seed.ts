// Seeds one demo centre. Run: npm run db:seed   (safe to re-run: skips if the demo centre exists)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as s from './schema';

async function main() {
  const client = postgres(process.env.DATABASE_URL!); const db = drizzle(client, { schema: s });
  if ((await db.select().from(s.centres).where(eq(s.centres.name, 'Demo Coaching Centre'))).length) { console.log('Demo centre already exists'); await client.end(); return; }
  const [centre] = await db.insert(s.centres).values({ name: 'Demo Coaching Centre', city: 'Ranchi', plan: 'standard' }).returning();
  if (!(await db.select().from(s.users).where(eq(s.users.mobile, '9090770070'))).length) await db.insert(s.users).values({ centreId: null, mobile: '9090770070', name: 'Kumud Ranjan', role: 'SUPER_ADMIN' });
  const [, fac] = await db.insert(s.users).values([{ centreId: centre.id, mobile: '9999900001', name: 'Centre Admin', role: 'ADMIN' }, { centreId: centre.id, mobile: '9999900002', name: 'Sharma Sir', role: 'FACULTY' }]).returning();
  const [batch] = await db.insert(s.batches).values({ centreId: centre.id, name: 'Class 12 PCM - Morning', course: 'JEE Foundation', capacity: 60 }).returning();
  await db.insert(s.facultyBatches).values({ centreId: centre.id, facultyId: fac.id, batchId: batch.id, subject: 'Physics' });
  const names = ['Aarav Kumar', 'Priya Singh', 'Rohan Verma', 'Anjali Mishra', 'Vikram Yadav'];
  const sts = await db.insert(s.students).values(names.map((name, i) => ({ centreId: centre.id, batchId: batch.id, name, rollNo: `12M-${i + 1}`, className: '12', parentName: `Parent of ${name.split(' ')[0]}`, parentMobile: `98765000${10 + i}` }))).returning();
  await db.insert(s.users).values(sts.map((st) => ({ centreId: centre.id, mobile: st.parentMobile, name: st.parentName!, role: 'PARENT' as const })));
  const [su] = await db.insert(s.users).values({ centreId: centre.id, mobile: '9999900003', name: 'Aarav Kumar', role: 'STUDENT' }).returning(); await db.update(s.students).set({ userId: su.id, mobile: '9999900003' }).where(eq(s.students.id, sts[0].id));
  const [plan] = await db.insert(s.feePlans).values({ centreId: centre.id, batchId: batch.id, name: 'Monthly tuition', amount: '2500', cycle: 'monthly' }).returning();
  await db.insert(s.studentFeePlans).values(sts.map((st) => ({ centreId: centre.id, studentId: st.id, planId: plan.id, startDate: new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10) })));
  await db.insert(s.feePayments).values({ centreId: centre.id, studentId: sts[0].id, amount: '2500', mode: 'UPI', paidOn: new Date().toISOString().slice(0, 10), receiptNo: 'R2026-00001' });
  await db.insert(s.timetableSlots).values([1, 2, 3, 4, 5].map((d) => ({ centreId: centre.id, batchId: batch.id, facultyId: fac.id, weekday: d, startTime: '07:00', endTime: '08:30', subject: 'Physics' })));
  await db.insert(s.notices).values({ centreId: centre.id, type: 'GENERAL', title: 'Welcome', body: 'Classes start Monday 7 am. Please download the app.' });
  await db.insert(s.content).values({ centreId: centre.id, batchId: batch.id, subject: 'Physics', chapter: 'Ch 3 · Laws of Motion', title: 'Class notes', kind: 'text', body: 'Newton’s three laws, free-body diagrams, friction. Practice Q1–Q15.', createdBy: fac.id });
  await db.insert(s.tests).values({ centreId: centre.id, batchId: batch.id, title: 'Weekly test 1 · Physics', subject: 'Physics', mode: 'online', date: new Date().toISOString().slice(0, 10), maxMarks: 3, published: true, createdBy: fac.id,
    questions: JSON.stringify([{ q: 'SI unit of force?', opts: ['Joule', 'Newton', 'Watt', 'Pascal'], ans: 'B', chapter: 'Laws of Motion' }, { q: 'Acceleration due to gravity on Earth is about', opts: ['9.8 m/s²', '3.7 m/s²', '1.6 m/s²', '12 m/s²'], ans: 'A', chapter: 'Gravitation' }, { q: 'Friction always acts', opts: ['Along motion', 'Opposite to relative motion', 'Upwards', 'Randomly'], ans: 'B', chapter: 'Laws of Motion' }]) });
  await db.insert(s.homework).values({ centreId: centre.id, batchId: batch.id, title: 'Exercise 3.2, Q1–10', subject: 'Physics', dueAt: new Date(Date.now() + 2 * 864e5), createdBy: fac.id });
  console.log(`Seeded. Logins (OTP 123456 in dev): admin 9999900001 · faculty 9999900002 · student 9999900003 · parent 9876500010 · super-admin 9090770070`);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
