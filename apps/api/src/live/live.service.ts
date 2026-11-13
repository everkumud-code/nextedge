import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, liveClasses, students, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

/** Who still needs the link: children who are absent (or on leave) today and have not been sent it yet. Pure, so it can be self-tested. */
export function pickToNotify<T extends { id: string }>(absent: T[], alreadySent: string[]): T[] { const done = new Set(alreadySent); return absent.filter((s) => !done.has(s.id)); }
export const linkMessage = (name: string, topic: string) => ({ title: `${topic} is live now — join from home`, body: `${name} is not in class today. The class is being shown live. Tap to join.` });

/**
 * A "hybrid" live class is a class held in the classroom and shown live for the children who are absent. The teacher keeps the normal
 * attendance (absent stays absent: a board counts only physical presence); the link goes only to absent children and their parents, and
 * the minutes they watch are recorded.
 */
@Injectable()
export class LiveService {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  /** Children of this class's batch who are marked ABSENT or LEAVE today. */
  async absentToday(centreId: string, batchId: string) {
    const db = this.dbs.db; const rows = await db.select({ studentId: attendance.studentId, status: attendance.status }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.batchId, batchId), eq(attendance.date, today()), inArray(attendance.status, ['ABSENT', 'LEAVE'])));
    if (!rows.length) return [];
    const kids = await db.select({ id: students.id, name: students.name, userId: students.userId, parentMobile: students.parentMobile }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true), inArray(students.id, rows.map((r) => r.studentId))));
    return kids.map((k) => ({ ...k, status: rows.find((r) => r.studentId === k.id)!.status }));
  }

  /** Send the join link (push, then WhatsApp / SMS as the centre has set up) to every absent child's own login and the parent's login, once each. */
  async sendLinksToAbsent(centreId: string, cls: typeof liveClasses.$inferSelect) {
    const db = this.dbs.db; const absent = await this.absentToday(centreId, cls.batchId); const sentIds: string[] = JSON.parse(cls.linkSentTo || '[]'); const todo = pickToNotify(absent, sentIds);
    for (const k of todo) {
      const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, k.parentMobile), eq(users.role, 'PARENT')));
      const ids = [k.userId, p?.id].filter((x): x is string => !!x); const m = linkMessage(k.name, cls.title);
      this.notify.notifyUsers(centreId, ids, m.title, m.body, { urgent: true, data: { type: 'live', id: cls.id, studentId: k.id } });
    }
    if (todo.length) await db.update(liveClasses).set({ linkSentTo: JSON.stringify([...sentIds, ...todo.map((k) => k.id)]) }).where(eq(liveClasses.id, cls.id));
    return { sent: todo.length, absent: absent.length };
  }

  /** While a hybrid class is running, a child marked absent after the class started still gets the link (called after attendance is saved). */
  async onAttendanceSaved(centreId: string, batchId: string, date: string) {
    if (date !== today()) return;
    const live = await this.dbs.db.select().from(liveClasses).where(and(eq(liveClasses.centreId, centreId), eq(liveClasses.batchId, batchId), eq(liveClasses.status, 'live'), eq(liveClasses.hybrid, true)));
    for (const c of live) await this.sendLinksToAbsent(centreId, c);
  }
}
