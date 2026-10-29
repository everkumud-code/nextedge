import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { batches, centres, records, students } from '../db/schema';
import { Public } from '../common/auth.guard';
import { PlatformService } from '../platform/platform.service';

const pick = (d: any, keys: string[]) => Object.fromEntries(keys.filter((k) => d?.[k]).map((k) => [k, d[k]]));
const safeUrl = (u?: string) => (u && /^(https?:\/\/|\/api\/files\/)/.test(u) ? u : undefined);

/** The school's public website: only what the school switched on, and never any student or parent data. Off by default. */
@Controller()
export class SiteController {
  constructor(private dbs: DbService, private platform: PlatformService) {}
  @Public() @Get('public/school/:centreId') async site(@Param('centreId') id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException(); const db = this.dbs.db; const [c] = await db.select().from(centres).where(eq(centres.id, id)); if (!c) throw new NotFoundException('School not found');
    const s: any = await this.platform.settings(id); if (!s.siteEnabled) throw new NotFoundException('This school has not published a website yet');
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const bs = await db.select({ className: batches.className, name: batches.name }).from(batches).where(eq(batches.centreId, id));
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(students).where(and(eq(students.centreId, id), eq(students.active, true)));
    const rec = (kind: string) => db.select().from(records).where(and(eq(records.centreId, id), eq(records.kind, kind)));
    const events = (await db.select().from(records).where(and(eq(records.centreId, id), eq(records.kind, 'event'), gte(records.date, today))).orderBy(asc(records.date)).limit(8)).map((r) => ({ title: r.title, date: r.date, ...pick(JSON.parse(r.data || '{}'), ['venue', 'time', 'description', 'endDate']) }));
    const holidays = (await db.select().from(records).where(and(eq(records.centreId, id), eq(records.kind, 'holiday'), gte(records.date, today))).orderBy(asc(records.date)).limit(6)).map((r) => ({ title: r.title, date: r.date, endDate: JSON.parse(r.data || '{}').endDate }));
    const gallery = (await db.select().from(records).where(and(eq(records.centreId, id), eq(records.kind, 'gallery'), eq(records.status, 'published'))).orderBy(desc(records.date)).limit(12)).map((r) => { const d = JSON.parse(r.data || '{}'); return { title: r.title, date: r.date, url: safeUrl(d.url), cover: safeUrl(d.coverUrl), description: d.description }; }).filter((g) => g.url);
    return { id, name: c.name, type: c.institutionType, city: c.city, tagline: s.tagline, about: s.about, address: s.address, phone: s.phone, website: s.website, principal: s.principalName, board: s.board, affiliationNo: s.affiliationNo, session: s.academicSession, classes: [...new Set(bs.map((b) => b.className || b.name))], students: Number(n), events, holidays, gallery };
  }
}
