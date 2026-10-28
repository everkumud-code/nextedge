// Seeds one demo centre. Run: npm run db:seed   (safe to re-run: skips if the demo centre exists)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, isNull } from 'drizzle-orm';
import * as s from './schema';
import { MODULES } from '../common/permissions';

export async function seed() {
  const client = postgres(process.env.DATABASE_URL!); const db = drizzle(client, { schema: s });
  const DEMO_EMAILS: Record<string, string> = { '9090770070': 'ever.kumud@gmail.com', '9999900001': 'owner@demo.coaching', '9999900002': 'teacher@demo.coaching', '9999900003': 'student@demo.coaching', '9876500010': 'parent1@demo.coaching', '9876500011': 'parent2@demo.coaching', '9876500012': 'parent3@demo.coaching', '9876500013': 'parent4@demo.coaching', '9876500014': 'parent5@demo.coaching' };
  if ((await db.select().from(s.centres).where(eq(s.centres.name, 'Demo Coaching Centre'))).length) {
    // Already seeded: just make sure every demo login has an email (login is email-based now).
    for (const [mobile, email] of Object.entries(DEMO_EMAILS)) await db.update(s.users).set({ email }).where(and(eq(s.users.mobile, mobile), isNull(s.users.email)));
    await ensureExtras(db);
    console.log('Demo centre already exists — emails ensured'); await client.end(); return;
  }
  const [centre] = await db.insert(s.centres).values({ name: 'Demo Coaching Centre', city: 'Ranchi', plan: 'standard' }).returning();
  if (!(await db.select().from(s.users).where(eq(s.users.mobile, '9090770070'))).length) await db.insert(s.users).values({ centreId: null, mobile: '9090770070', email: 'ever.kumud@gmail.com', name: 'Kumud Ranjan', role: 'SUPER_ADMIN' });
  const [, fac] = await db.insert(s.users).values([{ centreId: centre.id, mobile: '9999900001', email: 'owner@demo.coaching', name: 'Demo Owner', role: 'ADMIN' }, { centreId: centre.id, mobile: '9999900002', email: 'teacher@demo.coaching', name: 'Sharma Sir', role: 'FACULTY' }]).returning();
  const [batch] = await db.insert(s.batches).values({ centreId: centre.id, name: 'Class 12 PCM - Morning', course: 'JEE Foundation', capacity: 60 }).returning();
  await db.insert(s.facultyBatches).values({ centreId: centre.id, facultyId: fac.id, batchId: batch.id, subject: 'Physics' });
  const names = ['Aarav Kumar', 'Priya Singh', 'Rohan Verma', 'Anjali Mishra', 'Vikram Yadav'];
  const sts = await db.insert(s.students).values(names.map((name, i) => ({ centreId: centre.id, batchId: batch.id, name, rollNo: `12M-${i + 1}`, className: '12', parentName: `Parent of ${name.split(' ')[0]}`, parentMobile: `98765000${10 + i}` }))).returning();
  await db.insert(s.users).values(sts.map((st, i) => ({ centreId: centre.id, mobile: st.parentMobile, email: `parent${i + 1}@demo.coaching`, name: st.parentName!, role: 'PARENT' as const })));
  const [su] = await db.insert(s.users).values({ centreId: centre.id, mobile: '9999900003', email: 'student@demo.coaching', name: 'Aarav Kumar', role: 'STUDENT' }).returning(); await db.update(s.students).set({ userId: su.id, mobile: '9999900003' }).where(eq(s.students.id, sts[0].id));
  const [plan] = await db.insert(s.feePlans).values({ centreId: centre.id, batchId: batch.id, name: 'Monthly tuition', amount: '2500', cycle: 'monthly' }).returning();
  await db.insert(s.studentFeePlans).values(sts.map((st) => ({ centreId: centre.id, studentId: st.id, planId: plan.id, startDate: new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10) })));
  await db.insert(s.feePayments).values({ centreId: centre.id, studentId: sts[0].id, amount: '2500', mode: 'UPI', paidOn: new Date().toISOString().slice(0, 10), receiptNo: 'R2026-00001' });
  await db.insert(s.timetableSlots).values([1, 2, 3, 4, 5].map((d) => ({ centreId: centre.id, batchId: batch.id, facultyId: fac.id, weekday: d, startTime: '07:00', endTime: '08:30', subject: 'Physics' })));
  await db.insert(s.notices).values({ centreId: centre.id, type: 'GENERAL', title: 'Welcome', body: 'Classes start Monday 7 am. Please download the app.' });
  await db.insert(s.content).values({ centreId: centre.id, batchId: batch.id, subject: 'Physics', chapter: 'Ch 3 · Laws of Motion', title: 'Class notes', kind: 'text', body: 'Newton’s three laws, free-body diagrams, friction. Practice Q1–Q15.', createdBy: fac.id });
  await db.insert(s.tests).values({ centreId: centre.id, batchId: batch.id, title: 'Weekly test 1 · Physics', subject: 'Physics', mode: 'online', date: new Date().toISOString().slice(0, 10), maxMarks: 3, published: true, createdBy: fac.id,
    questions: JSON.stringify([{ q: 'SI unit of force?', opts: ['Joule', 'Newton', 'Watt', 'Pascal'], ans: 'B', chapter: 'Laws of Motion' }, { q: 'Acceleration due to gravity on Earth is about', opts: ['9.8 m/s²', '3.7 m/s²', '1.6 m/s²', '12 m/s²'], ans: 'A', chapter: 'Gravitation' }, { q: 'Friction always acts', opts: ['Along motion', 'Opposite to relative motion', 'Upwards', 'Randomly'], ans: 'B', chapter: 'Laws of Motion' }]) });
  await db.insert(s.homework).values({ centreId: centre.id, batchId: batch.id, title: 'Exercise 3.2, Q1–10', subject: 'Physics', dueAt: new Date(Date.now() + 2 * 864e5), createdBy: fac.id });
  await ensureExtras(db);
  console.log('Seeded. Logins: coaching "Demo Coaching Centre" + owner@demo.coaching / teacher@demo.coaching / student@demo.coaching / parent1@demo.coaching; Platform + ever.kumud@gmail.com');
  await client.end();
}
if (require.main === module) seed().catch((e) => { console.error(e); process.exit(1); });

/** Demo staff (front-desk) and a platform counsellor; safe to re-run. */
async function ensureExtras(db: any) {
  const [centre] = await db.select().from(s.centres).where(eq(s.centres.name, 'Demo Coaching Centre')); if (!centre) return;
  // Demo centre always has every module switched on (new modules appear as they are built).
  await db.update(s.centreSettings).set({ features: JSON.stringify([...MODULES]) }).where(eq(s.centreSettings.centreId, centre.id));
  if (!(await db.select().from(s.users).where(eq(s.users.email, 'staff@demo.coaching'))).length) {
    const [st] = await db.insert(s.users).values({ centreId: centre.id, mobile: '9999900004', email: 'staff@demo.coaching', name: 'Demo Front Desk', role: 'STAFF' }).returning();
    await db.insert(s.staffPermissions).values({ userId: st.id, centreId: centre.id, modules: JSON.stringify(['students', 'attendance', 'fees', 'notices', 'enquiries', 'leaves', 'feedback']), title: 'Receptionist' });
  }
  if (!(await db.select().from(s.users).where(eq(s.users.email, 'counsellor@demo.coaching'))).length)
    await db.insert(s.users).values({ centreId: null, mobile: '9999900005', email: 'counsellor@demo.coaching', name: 'Demo Counsellor', role: 'EXPERT' });
  // Demo counselling data so the console is not empty
  const [expert] = await db.select().from(s.users).where(eq(s.users.email, 'counsellor@demo.coaching'));
  const [student] = await db.select().from(s.users).where(eq(s.users.email, 'student@demo.coaching'));
  const [parent] = await db.select().from(s.users).where(eq(s.users.email, 'parent2@demo.coaching'));
  const [aarav] = await db.select().from(s.students).where(and(eq(s.students.centreId, centre.id), eq(s.students.name, 'Aarav Kumar')));
  if (aarav && !(await db.select().from(s.records).where(eq(s.records.centreId, centre.id))).length) {
      const [route] = await db.insert(s.records).values({ centreId: centre.id, kind: 'transport-route', title: 'Route 1 — Lalpur to Kanke Road', status: 'active', data: JSON.stringify({ vehicle: 'JH01AB1234', driver: 'Ramesh Yadav', driverMobile: '9876500099', stops: 'Lalpur 7:10\nKokar 7:20\nBariatu 7:30\nKanke Road 7:45', fee: 1200, capacity: 30 }) }).returning();
      await db.insert(s.records).values([
        { centreId: centre.id, kind: 'transport-assign', studentId: aarav.id, refId: route.id, title: 'Kokar', status: 'active', parentVisible: true, data: JSON.stringify({ dropStop: 'Kokar', pickupTime: '07:20', dropTime: '16:30' }) },
        { centreId: centre.id, kind: 'book', title: 'Concepts of Physics — H.C. Verma (Vol 1)', status: 'available', data: JSON.stringify({ author: 'H.C. Verma', isbn: '9788177091878', subject: 'Physics', copies: 5, shelf: 'A2', price: 450 }) },
        { centreId: centre.id, kind: 'achievement', studentId: aarav.id, title: 'Gold medal — District Maths Olympiad', date: '2026-10-05', status: 'published', parentVisible: true, data: JSON.stringify({ area: 'Olympiad', level: 'District', position: '1st' }) },
        { centreId: centre.id, kind: 'holiday', title: 'Diwali break', date: '2026-11-08', status: 'holiday', parentVisible: true, data: JSON.stringify({ endDate: '2026-11-12', forWhom: 'Everyone' }) },
        { centreId: centre.id, kind: 'event', title: 'Annual Day', date: '2026-12-20', status: 'planned', parentVisible: true, data: JSON.stringify({ time: '17:00', venue: 'Town Hall, Ranchi', inCharge: 'Sharma Sir' }) },
        { centreId: centre.id, kind: 'lesson', title: 'Kinematics — equations of motion', date: new Date().toISOString().slice(0, 10), status: 'taught', parentVisible: true, data: JSON.stringify({ subject: 'Physics', batch: 'Class 12 PCM - Morning', teacher: 'Sharma Sir', homework: 'Ex 3.1 Q1–10' }) },
        { centreId: centre.id, kind: 'item', title: 'Whiteboard markers', status: 'low', data: JSON.stringify({ category: 'Stationery', qty: 8, unit: 'pcs', minQty: 10, location: 'Store' }) },
      ]);
    }
  if (expert && student && !(await db.select().from(s.wellbeingRequests).where(eq(s.wellbeingRequests.centreId, centre.id))).length) {
    const [r1] = await db.insert(s.wellbeingRequests).values({ centreId: centre.id, studentId: aarav?.id, requesterId: student.id, requesterRole: 'STUDENT', category: 'exam-stress', text: 'JEE mock tests are coming and I cannot sleep properly. I keep thinking I will fail even after studying all day.', urgency: 'normal', status: 'in-progress', expertId: expert.id }).returning();
    await db.insert(s.wellbeingMessages).values([{ requestId: r1.id, senderId: student.id, senderRole: 'STUDENT', text: 'JEE mock tests are coming and I cannot sleep properly. I keep thinking I will fail even after studying all day.' }, { requestId: r1.id, senderId: expert.id, senderRole: 'EXPERT', text: 'Thank you for writing, Aarav. What you describe is very common before mocks. Let us talk for 20 minutes this week — meanwhile try the 4-7-8 breathing before bed. Would tomorrow 6 pm work?' }]);
    if (parent) { const [r2] = await db.insert(s.wellbeingRequests).values({ centreId: centre.id, requesterId: parent.id, requesterRole: 'PARENT', category: 'focus', text: 'My daughter spends hours on the phone and her marks have dropped this term. We fight about it daily. How should I handle this?', urgency: 'normal', status: 'new' }).returning();
      await db.insert(s.wellbeingMessages).values({ requestId: r2.id, senderId: parent.id, senderRole: 'PARENT', text: 'My daughter spends hours on the phone and her marks have dropped this term. We fight about it daily. How should I handle this?' }); }
    await db.insert(s.wellbeingPosts).values({ expertId: expert.id, title: 'Before a big test: the 10-minute reset', body: '1) Close the books 10 minutes before you start.\n2) Breathe in for 4, hold for 7, out for 8 — four rounds.\n3) Write down the one thing you are worried about, then fold the paper.\n4) Walk in. You have prepared; the paper is just questions.', audience: 'students' });
  }
}
