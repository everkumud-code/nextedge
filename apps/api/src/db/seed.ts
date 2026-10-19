// Seeds one demo centre so the admin panel has something to show. Run: npm run db:seed
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as s from './schema';

async function main() {
  const client = postgres(process.env.DATABASE_URL!);
  const db = drizzle(client, { schema: s });
  const [centre] = await db.insert(s.centres).values({ name: 'Demo Coaching Centre', city: 'Ranchi', plan: 'standard' }).returning();
  await db.insert(s.users).values([
    { centreId: null, mobile: '9090770070', name: 'Kumud Ranjan', role: 'SUPER_ADMIN' },
    { centreId: centre.id, mobile: '9999900001', name: 'Centre Admin', role: 'ADMIN' },
    { centreId: centre.id, mobile: '9999900002', name: 'Sharma Sir', role: 'FACULTY' },
  ]);
  const [batch] = await db.insert(s.batches).values({ centreId: centre.id, name: 'Class 12 PCM - Morning', course: 'JEE Foundation', capacity: 60 }).returning();
  const names = ['Aarav Kumar', 'Priya Singh', 'Rohan Verma', 'Anjali Mishra', 'Vikram Yadav'];
  await db.insert(s.students).values(names.map((name, i) => ({
    centreId: centre.id, batchId: batch.id, name, rollNo: `12M-${i + 1}`, className: '12',
    parentName: `Parent of ${name.split(' ')[0]}`, parentMobile: `98765000${10 + i}`,
  })));
  await db.insert(s.feePlans).values({ centreId: centre.id, batchId: batch.id, name: 'Monthly tuition', amount: '2500', cycle: 'monthly' });
  await db.insert(s.notices).values({ centreId: centre.id, type: 'GENERAL', title: 'Welcome', body: 'Classes start Monday 7 am.' });
  console.log('Seeded centre', centre.id, '- login as admin with mobile 9999900001, OTP 123456');
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
