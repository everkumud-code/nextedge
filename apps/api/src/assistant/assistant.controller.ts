import { BadRequestException, Body, Controller, Get, HttpException, Post, Query } from '@nestjs/common';
import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance, batches, centres, leaveRequests, records, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { RedisService } from '../common/redis.service';
import { FeesController } from '../fees/fees.controller';
import { AlertsController } from '../insights/alerts.controller';
import { HELP, searchHelp } from './help-kb';

type Msg = { role: 'user' | 'assistant'; content: any };
const TOOLS = [
  { name: 'how_to', description: 'Look up how to do something in the NextEdge admin panel (menu path and steps). Use for any "how do I…" question.', input_schema: { type: 'object', properties: { topic: { type: 'string', description: 'what the user wants to do' } }, required: ['topic'] } },
  { name: 'school_overview', description: 'Headline numbers: active students, staff, classes, today\'s attendance, pending leave requests, admission applications to process, fee dues.', input_schema: { type: 'object', properties: {} } },
  { name: 'find_student', description: 'Find students by name, roll number, admission number or parent mobile. Returns class, parent details, fee balance.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'fee_defaulters', description: 'Students with unpaid fees, biggest balance first.', input_schema: { type: 'object', properties: { limit: { type: 'integer', description: 'how many, default 10, max 25' } } } },
  { name: 'attendance_today', description: 'Today\'s attendance per class: present, absent, not yet marked.', input_schema: { type: 'object', properties: {} } },
  { name: 'alerts', description: 'What needs attention today across the school (fees, absentees, leave, admissions, follow-ups, stock).', input_schema: { type: 'object', properties: {} } },
];
const ADMINS = ['ADMIN', 'SUPER_ADMIN'];

/** "Ask NextEdge": answers how-to questions from the help articles, and (when the AI key is set) real questions about the school's own data using read-only lookups. */
@Controller('assistant')
@Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'FACULTY')
export class AssistantController {
  constructor(private dbs: DbService, private redis: RedisService, private fees: FeesController, private alertsC: AlertsController) {}
  @Get('status') status() { return { ai: !!process.env.ANTHROPIC_API_KEY }; }

  private allowed(u: JwtUser) { const m = u.modules || []; const all = ADMINS.includes(u.role); return new Set(['how_to', ...(all || m.includes('attendance') ? ['attendance_today'] : []), ...(all || m.includes('students') ? ['find_student', 'school_overview'] : []), ...(all || m.includes('fees') ? ['fee_defaulters'] : []), ...(all ? ['alerts'] : [])]); }

  private async run(name: string, input: any, u: JwtUser, centreId: string, q: string): Promise<any> {
    const db = this.dbs.db; const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    if (name === 'how_to') { const hits = searchHelp(`${input?.topic || ''} ${q}`, 3); return hits.length ? hits.map((h) => ({ title: h.title, steps: h.text, menu: h.link })) : { note: 'No help article matched.', topics: HELP.map((h) => h.title) }; }
    if (name === 'school_overview') {
      const [{ n: st }] = await db.select({ n: sql<number>`count(*)` }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const [{ n: bt }] = await db.select({ n: sql<number>`count(*)` }).from(batches).where(eq(batches.centreId, centreId)); const [{ n: sf }] = await db.select({ n: sql<number>`count(*)` }).from(users).where(and(eq(users.centreId, centreId), sql`${users.role} in ('FACULTY','STAFF','ADMIN')`));
      const at = await db.select({ s: attendance.status, n: sql<number>`count(*)` }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.date, today))).groupBy(attendance.status); const marked = at.reduce((a, x) => a + Number(x.n), 0); const present = at.filter((x) => x.s === 'PRESENT' || x.s === 'LATE').reduce((a, x) => a + Number(x.n), 0);
      const [{ n: lv }] = await db.select({ n: sql<number>`count(*)` }).from(leaveRequests).where(and(eq(leaveRequests.centreId, centreId), eq(leaveRequests.status, 'pending'))); const [{ n: ad }] = await db.select({ n: sql<number>`count(*)` }).from(records).where(and(eq(records.centreId, centreId), eq(records.kind, 'admission'), sql`${records.status} in ('new','documents-pending')`));
      let due = { students: 0, amount: 0 }; try { const d = await this.fees.defaulters(u, centreId); due = { students: d.length, amount: Math.round(d.reduce((a: number, r: any) => a + r.balance, 0)) }; } catch { /* no fee access */ }
      return { activeStudents: Number(st), classes: Number(bt), staff: Number(sf), today: today, attendanceMarkedToday: marked, presentToday: present, attendancePercentToday: marked ? Math.round((present / marked) * 100) : null, pendingStudentLeaves: Number(lv), admissionsToProcess: Number(ad), feeDues: due };
    }
    if (name === 'find_student') {
      const s = String(input?.query || '').trim(); if (s.length < 2) return { error: 'Give at least 2 letters' }; const like = `%${s.replace(/[%_]/g, '')}%`;
      const rows = await db.select().from(students).where(and(eq(students.centreId, centreId), or(ilike(students.name, like), ilike(students.rollNo, like), ilike(students.admissionNo, like), ilike(students.parentMobile, like)))).limit(5); const bs = await db.select().from(batches).where(eq(batches.centreId, centreId)); let bal: Record<string, number> = {}; try { (await this.fees.defaulters(u, centreId)).forEach((r: any) => (bal[r.studentId || r.id] = Math.round(r.balance))); } catch { bal = {}; }
      return rows.map((r) => ({ name: r.name, class: bs.find((b) => b.id === r.batchId)?.name || r.className, rollNo: r.rollNo, admissionNo: r.admissionNo, parent: r.parentName || r.fatherName, parentMobile: r.parentMobile, active: r.active, feeBalance: bal[r.id] ?? 0 }));
    }
    if (name === 'fee_defaulters') { const lim = Math.min(Math.max(Number(input?.limit) || 10, 1), 25); const d = await this.fees.defaulters(u, centreId); return { count: d.length, totalBalance: Math.round(d.reduce((a: number, r: any) => a + r.balance, 0)), top: d.slice(0, lim).map((r: any) => ({ name: r.name, class: r.batchName || r.batch, balance: Math.round(r.balance) })) }; }
    if (name === 'attendance_today') {
      const bs = await db.select().from(batches).where(eq(batches.centreId, centreId)); const sts = await db.select({ id: students.id, b: students.batchId }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true))); const at = await db.select({ sid: attendance.studentId, s: attendance.status }).from(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.date, today)));
      return bs.map((b) => { const ids = sts.filter((x) => x.b === b.id).map((x) => x.id); const a = at.filter((x) => ids.includes(x.sid)); return { class: b.name, students: ids.length, present: a.filter((x) => x.s === 'PRESENT' || x.s === 'LATE').length, absent: a.filter((x) => x.s === 'ABSENT').length, notMarked: ids.length - a.length }; }).filter((x) => x.students);
    }
    if (name === 'alerts') { const a = await this.alertsC.alerts(u, centreId); return a.alerts.map((x: any) => ({ what: x.label, count: x.count, hint: x.hint, examples: x.sample })); }
    return { error: 'Unknown tool' };
  }

  @Post('ask') async ask(@CurrentUser() u: JwtUser, @Body() b: { question: string; history?: Msg[] }, @Query('centreId') c?: string) {
    const q = String(b.question || '').trim().slice(0, 1500); if (q.length < 2) throw new BadRequestException('Type your question'); const centreId = centreOf(u, c);
    if ((await this.redis.hit(`assist:${u.id}`, 3600)) > 40) throw new HttpException('You have asked a lot of questions this hour. Please try again a little later.', 429);
    const links = (hits: any[]) => hits.map((h) => ({ title: h.title, link: h.link })).filter((l) => l.link);
    if (!process.env.ANTHROPIC_API_KEY) {
      const hits = searchHelp(q, 3); if (!hits.length) return { answer: 'I could not find that in the help articles. Try other words (for example "add student", "fees", "attendance", "report card", "SMS"). Smart answers about your own data switch on when the platform team adds the AI key.', source: 'help', links: [] };
      return { answer: `${hits[0].title}\n${hits[0].text}${hits.length > 1 ? `\n\nAlso: ${hits.slice(1).map((h) => h.title).join(' · ')}` : ''}`, source: 'help', links: links(hits) };
    }
    const [ce] = await this.dbs.db.select({ name: centres.name, type: centres.institutionType }).from(centres).where(eq(centres.id, centreId)); const allowed = this.allowed(u); const tools = TOOLS.filter((t) => allowed.has(t.name)); const used: string[] = []; const hitLinks: any[] = [];
    const system = `You are the NextEdge assistant inside the admin panel of "${ce?.name}", a ${ce?.type === 'school' ? 'school' : 'coaching centre'} in India. The user is a ${u.role.toLowerCase()} named ${u.name}. Today is ${new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10)} (IST). Reply briefly and plainly, in the language the user writes (English, Hindi or Hinglish). For any number or fact about students, fees or attendance, call a tool; never guess or invent. For "how do I…" questions call how_to and answer with the menu path and the steps. You can only read data: you cannot change anything, so tell the user which page to use. If a tool returns nothing, say so. Money is in rupees.`;
    const messages: Msg[] = [...(Array.isArray(b.history) ? b.history : []).slice(-8).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })), { role: 'user', content: q }];
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${process.env.AI_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-4-6', max_tokens: 1200, system, tools, messages }) });
      const j: any = await res.json().catch(() => ({})); if (!res.ok) throw new HttpException(`The assistant could not answer right now (${j?.error?.message || res.status}).`, 502);
      const blocks: any[] = j.content || []; const text = blocks.filter((x) => x.type === 'text').map((x) => x.text).join('\n').trim();
      if (j.stop_reason !== 'tool_use') return { answer: text || 'I could not work out an answer. Please rephrase.', source: 'ai', tools: used, links: links(hitLinks) };
      messages.push({ role: 'assistant', content: blocks }); const results: any[] = [];
      for (const t of blocks.filter((x) => x.type === 'tool_use')) { used.push(t.name); let out: any; try { out = allowed.has(t.name) ? await this.run(t.name, t.input, u, centreId, q) : { error: 'You do not have access to this information.' }; } catch (e: any) { out = { error: String(e?.message || 'failed').slice(0, 200) }; } if (t.name === 'how_to' && Array.isArray(out)) hitLinks.push(...out.map((o: any) => ({ title: o.title, link: o.menu }))); results.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(out).slice(0, 12000) }); }
      messages.push({ role: 'user', content: results });
    }
    return { answer: 'That needed too many steps. Please ask a simpler question.', source: 'ai', tools: used, links: [] };
  }
}
