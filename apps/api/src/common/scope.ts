import { and, eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import { JwtUser } from './current-user.decorator';
/** Students this user is allowed to act for: STUDENT → own row; PARENT → children; staff → all active in centre. */
export async function myStudents(db: PostgresJsDatabase<typeof schema>, u: JwtUser, centreId: string) {
  const s = schema.students;
  if (u.role === 'STUDENT') return db.select().from(s).where(and(eq(s.centreId, centreId), eq(s.userId, u.id), eq(s.active, true)));
  if (u.role === 'PARENT') { const [me] = await db.select({ mobile: schema.users.mobile }).from(schema.users).where(eq(schema.users.id, u.id)); return db.select().from(s).where(and(eq(s.centreId, centreId), eq(s.parentMobile, me?.mobile || ''), eq(s.active, true))); }
  return db.select().from(s).where(and(eq(s.centreId, centreId), eq(s.active, true)));
}
