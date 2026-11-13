import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { PlatformService } from '../platform/platform.service';
import { DbService } from '../db/db.service';
import { centres, files, notices, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { NotificationsService } from '../notifications/notifications.service';

export const GREETINGS: Record<string, { title: string; body: string }> = {
  diwali: { title: 'Happy Diwali 🪔', body: 'May this Diwali light up your home and your future. Warm wishes from {centre}.' },
  holi: { title: 'Happy Holi 🎨', body: 'Wishing you a colourful, joyful Holi. — {centre}' },
  eid: { title: 'Eid Mubarak 🌙', body: 'May this Eid bring peace and happiness to you and your family. — {centre}' },
  christmas: { title: 'Merry Christmas 🎄', body: 'Season’s greetings and best wishes from all of us at {centre}.' },
  newyear: { title: 'Happy New Year 🎉', body: 'A new year, new goals. Let’s make it count. — {centre}' },
  independence: { title: 'Happy Independence Day 🇮🇳', body: 'Jai Hind! Proud of every student working hard for a brighter India. — {centre}' },
  republic: { title: 'Happy Republic Day 🇮🇳', body: 'Warm wishes on Republic Day from {centre}.' },
  exam: { title: 'All the best! ✨', body: 'Stay calm, trust your preparation. We believe in you. — {centre}' },
  result: { title: 'Congratulations 🎓', body: 'Proud of your results. Keep going! — {centre}' },
  custom: { title: '', body: '' },
};
const DEFAULT_BDAY = 'Happy birthday, {name}! 🎂 Wishing you a wonderful year ahead. — {centre}';

class GreetDto { @IsIn(Object.keys(GREETINGS)) kind: string; @IsOptional() @IsString() title?: string; @IsOptional() @IsString() body?: string; @IsOptional() @IsString() batchId?: string; @IsOptional() @IsString() imageUrl?: string; }

/** Birthday wishes (auto, 7 am IST) and festival greetings (one click). */
@Controller('wishes')
@Mod('notices')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STAFF')
export class WishesController {
  constructor(private dbs: DbService, private notify: NotificationsService, private platform: PlatformService) {}

  /** Name, logo and contact details for the social-media post maker. */
  @Get('brand') async brand(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const [ce] = await db.select().from(centres).where(eq(centres.id, centreId)); const s: any = await this.platform.settings(centreId);
    const [logo] = await db.select({ id: files.id }).from(files).where(and(eq(files.centreId, centreId), eq(files.ownerKind, 'logo'))).orderBy(desc(files.createdAt)).limit(1);
    return { name: ce?.name || '', city: ce?.city || '', tagline: s.tagline || '', phone: s.phone || '', website: s.website || '', address: s.address || '', principal: s.principalName || '', board: s.board || '', colour: s.appColour || '', logoId: logo?.id || null, type: ce?.institutionType || 'coaching' };
  }
  @Get('templates') templates() { return Object.entries(GREETINGS).map(([k, v]) => ({ kind: k, ...v })); }

  /** Who has a birthday today / this week. */
  @Get('birthdays') async birthdays(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const rows = await this.dbs.db.select({ id: students.id, name: students.name, dob: students.dob, batchId: students.batchId }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true), sql`${students.dob} is not null`));
    const ist = new Date(Date.now() + 5.5 * 3600e3); const md = (d: Date) => d.toISOString().slice(5, 10);
    const todayMd = md(ist); const week = new Set(Array.from({ length: 7 }, (_, i) => md(new Date(ist.getTime() + i * 864e5))));
    return rows.map((r) => ({ ...r, md: r.dob!.slice(5, 10) })).filter((r) => week.has(r.md)).map((r) => ({ ...r, today: r.md === todayMd })).sort((a, b) => a.md.localeCompare(b.md));
  }

  @Get('birthday-template') async getBday(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) { const [ce] = await this.dbs.db.select().from(centres).where(eq(centres.id, centreOf(u, c))); return { template: ce?.birthdayWish || DEFAULT_BDAY }; }
  @Put('birthday-template') @Roles('SUPER_ADMIN', 'ADMIN') async setBday(@CurrentUser() u: JwtUser, @Body() b: { template: string }, @Query('centreId') c?: string) { await this.dbs.db.update(centres).set({ birthdayWish: b.template }).where(eq(centres.id, centreOf(u, c))); return { ok: true }; }

  /** Send a greeting to the whole centre or one batch: posts a GREETING notice (with optional image) and pushes it. */
  @Post('greet') async greet(@CurrentUser() u: JwtUser, @Body() dto: GreetDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const [ce] = await this.dbs.db.select().from(centres).where(eq(centres.id, centreId));
    const t = GREETINGS[dto.kind]; const title = (dto.title || t.title).replace('{centre}', ce.name); const body = (dto.body || t.body).replace('{centre}', ce.name);
    if (!title || !body) return { error: 'Title and message are required' };
    const [row] = await this.dbs.db.insert(notices).values({ centreId, type: 'GREETING', title, body, batchId: dto.batchId || null, imageUrl: dto.imageUrl, createdBy: u.id, expiresAt: new Date(Date.now() + 3 * 864e5) }).returning();
    const aud = await this.notify.audienceForBatch(centreId, dto.batchId || null);
    this.notify.notifyUsers(centreId, aud, title, body, { data: { type: 'notice', id: row.id } });
    return { ok: true, sent: aud.length, noticeId: row.id };
  }

  /** Called by the scheduler every morning: wish every student whose birthday is today (student + parent). */
  async sendBirthdayWishes() {
    const db = this.dbs.db; const todayMd = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(5, 10);
    const rows = await db.select({ id: students.id, name: students.name, centreId: students.centreId, userId: students.userId, parentMobile: students.parentMobile, dob: students.dob }).from(students).where(and(eq(students.active, true), sql`to_char(${students.dob}, 'MM-DD') = ${todayMd}`));
    let n = 0;
    for (const s of rows) { const [ce] = await db.select().from(centres).where(eq(centres.id, s.centreId));
      const body = (ce?.birthdayWish || DEFAULT_BDAY).replace('{name}', s.name.split(' ')[0]).replace('{centre}', ce?.name || 'your coaching');
      const ids: string[] = []; if (s.userId) ids.push(s.userId); const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, s.centreId), eq(users.mobile, s.parentMobile), eq(users.role, 'PARENT'))); if (p) ids.push(p.id);
      if (ids.length) { this.notify.notifyUsers(s.centreId, ids, `🎂 Happy birthday ${s.name.split(' ')[0]}!`, body, { data: { type: 'wish', studentId: s.id } }); n++; }
      const staff = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, s.centreId), eq(users.role, 'ADMIN')));
      this.notify.notifyUsers(s.centreId, staff.map((x) => x.id), `Today: ${s.name}’s birthday 🎂`, 'A wish has been sent to the student and parent.', { data: { type: 'wish', studentId: s.id } });
    }
    return n;
  }
}
