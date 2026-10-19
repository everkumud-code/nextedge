import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { students, users } from '../db/schema';

export type StudentInput = { name: string; parentMobile: string; parentName?: string; mobile?: string; className?: string; rollNo?: string; batchId?: string | null };

@Injectable()
export class StudentsService {
  constructor(private dbs: DbService) {}

  /** Creates the student row and makes sure a PARENT login (and STUDENT login if the student has a mobile) exists. */
  async create(centreId: string, dto: StudentInput) {
    const db = this.dbs.db;
    const parent = await this.ensureUser(centreId, dto.parentMobile, dto.parentName || `Parent of ${dto.name}`, 'PARENT');
    const studentUser = dto.mobile && dto.mobile.length === 10 ? await this.ensureUser(centreId, dto.mobile, dto.name, 'STUDENT') : null;
    const [row] = await db.insert(students).values({
      centreId, name: dto.name, parentMobile: dto.parentMobile, parentName: dto.parentName, mobile: dto.mobile,
      className: dto.className, rollNo: dto.rollNo, batchId: dto.batchId || null, userId: studentUser?.id ?? null,
    }).returning();
    return { ...row, parentUserId: parent.id };
  }

  /** Bulk import from a parsed Excel sheet. Rows with missing name/mobile or a duplicate roll number are skipped and reported. */
  async import(centreId: string, rows: StudentInput[], batchId?: string) {
    const existing = await this.dbs.db.select({ rollNo: students.rollNo, name: students.name, parentMobile: students.parentMobile })
      .from(students).where(and(eq(students.centreId, centreId), eq(students.active, true)));
    const seenRoll = new Set(existing.map((e) => (e.rollNo || '').toLowerCase()).filter(Boolean));
    const seenPair = new Set(existing.map((e) => `${e.name.toLowerCase()}|${e.parentMobile}`));
    const created: string[] = []; const skipped: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]; const mob = String(r.parentMobile || '').replace(/\D/g, '').slice(-10);
      if (!r.name?.trim()) { skipped.push({ row: i + 2, reason: 'No name' }); continue; }
      if (mob.length !== 10) { skipped.push({ row: i + 2, reason: 'Parent mobile must be 10 digits' }); continue; }
      const roll = (r.rollNo || '').toString().trim();
      if (roll && seenRoll.has(roll.toLowerCase())) { skipped.push({ row: i + 2, reason: `Roll no ${roll} already exists` }); continue; }
      if (seenPair.has(`${r.name.trim().toLowerCase()}|${mob}`)) { skipped.push({ row: i + 2, reason: 'Same student already exists' }); continue; }
      await this.create(centreId, { ...r, name: r.name.trim(), parentMobile: mob, rollNo: roll || undefined, mobile: r.mobile ? String(r.mobile).replace(/\D/g, '').slice(-10) : undefined, batchId: r.batchId || batchId || null });
      if (roll) seenRoll.add(roll.toLowerCase()); seenPair.add(`${r.name.trim().toLowerCase()}|${mob}`); created.push(r.name);
    }
    return { created: created.length, skipped };
  }

  private async ensureUser(centreId: string, mobile: string, name: string, role: 'PARENT' | 'STUDENT') {
    const db = this.dbs.db;
    const found = await db.query.users.findFirst({ where: and(eq(users.mobile, mobile), eq(users.centreId, centreId)) });
    if (found) return found;
    const [u] = await db.insert(users).values({ centreId, mobile, name, role }).returning();
    return u;
  }
}
