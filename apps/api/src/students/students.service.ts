import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, students, users } from '../db/schema';

import { cleanId } from '../insights/compliance';
/** Bulk import must not fail a whole file because one APAAR / PEN is mistyped: a bad value is dropped (the compliance page lists missing ones). */
const safeId = (k: 'APAAR' | 'PEN', v?: string) => { try { return cleanId(k, v); } catch { return null; } };
export type StudentInput = { name: string; parentMobile: string; parentName?: string; parentEmail?: string; mobile?: string; email?: string; className?: string; rollNo?: string; batchId?: string | null; dob?: string; gender?: string; admissionNo?: string; admissionDate?: string; fatherName?: string; motherName?: string; address?: string; category?: string; religion?: string; bloodGroup?: string; previousSchool?: string; apaarId?: string; pen?: string; photoConsent?: boolean; houseId?: string };

@Injectable()
export class StudentsService {
  constructor(private dbs: DbService) {}

  /** Creates the student row and makes sure a PARENT login (and STUDENT login if the student has a mobile) exists. */
  async create(centreId: string, dto: StudentInput) {
    const db = this.dbs.db;
    const parent = await this.ensureUser(centreId, dto.parentMobile, dto.parentName || `Parent of ${dto.name}`, 'PARENT', dto.parentEmail);
    const studentUser = dto.mobile && dto.mobile.length === 10 ? await this.ensureUser(centreId, dto.mobile, dto.name, 'STUDENT', dto.email) : null;
    // class name follows the section, roll number auto-continues within the section, school admission numbers are generated
    let className = dto.className; let rollNo = dto.rollNo;
    if (dto.batchId) { const [b] = await db.select({ name: batches.name, className: batches.className }).from(batches).where(eq(batches.id, dto.batchId)); if (b && !className) className = b.className || b.name;
      if (!rollNo) { const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(students).where(and(eq(students.batchId, dto.batchId), eq(students.centreId, centreId))); rollNo = String(Number(n) + 1); } }
    const [ce] = await db.select({ t: centres.institutionType }).from(centres).where(eq(centres.id, centreId)); let admissionNo = dto.admissionNo;
    if (!admissionNo && ce?.t === 'school') { const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(students).where(eq(students.centreId, centreId)); admissionNo = `ADM/${new Date().getFullYear()}/${String(Number(n) + 1).padStart(4, '0')}`; }
    const [row] = await db.insert(students).values({
      centreId, name: dto.name, parentMobile: dto.parentMobile, parentName: dto.parentName || dto.fatherName || dto.motherName, mobile: dto.mobile,
      className, rollNo, batchId: dto.batchId || null, userId: studentUser?.id ?? null, dob: dto.dob || null,
      gender: dto.gender, admissionNo, admissionDate: dto.admissionDate || new Date().toISOString().slice(0, 10), fatherName: dto.fatherName, motherName: dto.motherName, address: dto.address, category: dto.category, religion: dto.religion, bloodGroup: dto.bloodGroup, previousSchool: dto.previousSchool, apaarId: safeId('APAAR', dto.apaarId), pen: safeId('PEN', dto.pen), photoConsent: typeof dto.photoConsent === 'boolean' ? dto.photoConsent : null, houseId: dto.houseId || null,
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
      await this.create(centreId, { ...r, name: r.name.trim(), parentMobile: mob, rollNo: roll || undefined, mobile: r.mobile ? String(r.mobile).replace(/\D/g, '').slice(-10) : undefined, parentEmail: r.parentEmail || undefined, batchId: r.batchId || batchId || null });
      if (roll) seenRoll.add(roll.toLowerCase()); seenPair.add(`${r.name.trim().toLowerCase()}|${mob}`); created.push(r.name);
    }
    return { created: created.length, skipped };
  }

  private async ensureUser(centreId: string, mobile: string, name: string, role: 'PARENT' | 'STUDENT', email?: string) {
    const db = this.dbs.db; const em = email?.trim().toLowerCase() || undefined;
    const found = await db.query.users.findFirst({ where: and(eq(users.mobile, mobile), eq(users.centreId, centreId)) });
    if (found) { if (em && !found.email) await db.update(users).set({ email: em }).where(eq(users.id, found.id)); return found; }
    const [u] = await db.insert(users).values({ centreId, mobile, name, role, email: em }).returning();
    return u;
  }
}
