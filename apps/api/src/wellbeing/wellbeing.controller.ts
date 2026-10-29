import { Body, Controller, Get, Param, Post, Put, Query, ForbiddenException, BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres, students, users, wellbeingMessages, wellbeingPosts, wellbeingRequests } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';

export const CATEGORIES = ['exam-stress', 'anxiety', 'focus', 'family', 'bullying', 'career', 'other'];
class RequestDto { @IsOptional() @IsString() studentId?: string; @IsIn(CATEGORIES) category: string; @IsString() @Length(5, 4000) text: string; @IsOptional() @IsIn(['normal', 'urgent']) urgency?: string; }
class MsgDto { @IsString() @Length(1, 4000) text: string; }
class UpdateDto { @IsOptional() @IsIn(['assigned', 'scheduled', 'in-progress', 'closed']) status?: string; @IsOptional() @IsString() sessionAt?: string; @IsOptional() @IsString() sessionUrl?: string; @IsOptional() @IsString() expertNotes?: string; @IsOptional() @IsString() expertId?: string; }
class PostDto { @IsString() title: string; @IsString() body: string; @IsOptional() @IsIn(['all', 'students', 'parents']) audience?: string; }
class ExpertDto { @IsString() name: string; @IsString() email: string; @IsString() @Length(10, 10) mobile: string; }

const isExpert = (u: JwtUser) => u.role === 'EXPERT' || u.role === 'SUPER_ADMIN';
const roomUrl = (id: string) => `https://${process.env.JITSI_HOST || 'meet.jit.si'}/nextedge-care-${id.slice(0, 10)}#config.prejoinPageEnabled=false`;

/** Confidential counselling: students/parents write to platform experts. Centre owners see counts only, never content. */
@Controller('wellbeing')
@Mod('wellbeing')
export class WellbeingController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  @Get('categories') categories() { return { categories: CATEGORIES.map((c) => ({ key: c, label: LABELS[c] })) }; }

  /** Student / parent: create a request. */
  @Post('requests') async create(@CurrentUser() u: JwtUser, @Body() dto: RequestDto, @Query('centreId') c?: string) {
    if (!['STUDENT', 'PARENT'].includes(u.role)) throw new ForbiddenException('Only students and parents can request counselling');
    const centreId = centreOf(u, c); const db = this.dbs.db;
    let studentId = dto.studentId || null; if (studentId) { const mine = await myStudents(db, u, centreId); if (!mine.find((s) => s.id === studentId)) throw new ForbiddenException('Not your student'); }
    const [row] = await db.insert(wellbeingRequests).values({ centreId, studentId, requesterId: u.id, requesterRole: u.role, category: dto.category, text: dto.text, urgency: dto.urgency || 'normal' }).returning();
    await db.insert(wellbeingMessages).values({ requestId: row.id, senderId: u.id, senderRole: u.role, text: dto.text });
    const experts = await db.select({ id: users.id }).from(users).where(eq(users.role, 'EXPERT'));
    this.notify.notifyUsers(centreId, experts.map((e) => e.id), `${dto.urgency === 'urgent' ? '🔴 Urgent · ' : ''}New counselling request · ${LABELS[dto.category]}`, `From a ${u.role.toLowerCase()}. Open the counsellor console.`, { urgent: dto.urgency === 'urgent', data: { type: 'wellbeing', id: row.id } });
    return row;
  }

  /** Student / parent: my requests (with messages). */
  @Get('mine') async mine(@CurrentUser() u: JwtUser) {
    const db = this.dbs.db; const rows = await db.select().from(wellbeingRequests).where(eq(wellbeingRequests.requesterId, u.id)).orderBy(desc(wellbeingRequests.createdAt));
    const msgs = rows.length ? await db.select().from(wellbeingMessages).where(inArray(wellbeingMessages.requestId, rows.map((r) => r.id))).orderBy(wellbeingMessages.createdAt) : [];
    const ex = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'EXPERT'));
    return rows.map(({ expertNotes, ...r }) => ({ ...r, expertName: ex.find((e) => e.id === r.expertId)?.name || null, messages: msgs.filter((m) => m.requestId === r.id) }));
  }

  /** Reply in a thread — requester or an expert. */
  @Post('requests/:id/messages') async message(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: MsgDto) {
    const db = this.dbs.db; const [r] = await db.select().from(wellbeingRequests).where(eq(wellbeingRequests.id, id)); if (!r) throw new BadRequestException('Not found');
    if (!(r.requesterId === u.id || isExpert(u))) throw new ForbiddenException('Not your conversation');
    const [m] = await db.insert(wellbeingMessages).values({ requestId: id, senderId: u.id, senderRole: u.role, text: dto.text }).returning();
    await db.update(wellbeingRequests).set({ updatedAt: new Date(), status: r.status === 'new' && isExpert(u) ? 'in-progress' : r.status, expertId: r.expertId || (isExpert(u) && u.role === 'EXPERT' ? u.id : r.expertId) }).where(eq(wellbeingRequests.id, id));
    const to = isExpert(u) ? [r.requesterId] : r.expertId ? [r.expertId] : (await db.select({ id: users.id }).from(users).where(eq(users.role, 'EXPERT'))).map((e) => e.id);
    this.notify.notifyUsers(r.centreId, to, isExpert(u) ? 'Message from your counsellor' : 'New message in a counselling request', dto.text.slice(0, 90), { data: { type: 'wellbeing', id } });
    return m;
  }

  // ---------- Experts ----------
  @Get('queue') @Roles('SUPER_ADMIN', 'EXPERT') async queue(@CurrentUser() u: JwtUser, @Query('status') status?: string) {
    const db = this.dbs.db;
    const where = status === 'mine' ? eq(wellbeingRequests.expertId, u.id) : status ? eq(wellbeingRequests.status, status) : sql`${wellbeingRequests.status} <> 'closed'`;
    const rows = await db.select({ r: wellbeingRequests, centreName: centres.name, studentName: students.name, requesterName: users.name }).from(wellbeingRequests).innerJoin(centres, eq(centres.id, wellbeingRequests.centreId)).leftJoin(students, eq(students.id, wellbeingRequests.studentId)).innerJoin(users, eq(users.id, wellbeingRequests.requesterId)).where(where).orderBy(desc(sql`${wellbeingRequests.urgency} = 'urgent'`), desc(wellbeingRequests.updatedAt)).limit(300);
    const ids = rows.map((x) => x.r.id); const msgs = ids.length ? await db.select().from(wellbeingMessages).where(inArray(wellbeingMessages.requestId, ids)).orderBy(wellbeingMessages.createdAt) : [];
    return rows.map((x) => ({ ...x.r, centreName: x.centreName, studentName: x.studentName, requesterName: x.requesterName, categoryLabel: LABELS[x.r.category], messages: msgs.filter((m) => m.requestId === x.r.id) }));
  }

  @Put('requests/:id') @Roles('SUPER_ADMIN', 'EXPERT') async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdateDto) {
    const db = this.dbs.db; const [r] = await db.select().from(wellbeingRequests).where(eq(wellbeingRequests.id, id)); if (!r) throw new BadRequestException('Not found');
    const set: any = { updatedAt: new Date() }; if (dto.status) set.status = dto.status; if (dto.expertNotes !== undefined) set.expertNotes = dto.expertNotes; if (dto.expertId) set.expertId = dto.expertId; if (!r.expertId && u.role === 'EXPERT') set.expertId = u.id;
    if (dto.sessionAt) { set.sessionAt = new Date(dto.sessionAt); set.sessionUrl = dto.sessionUrl || r.sessionUrl || roomUrl(id); set.status = dto.status || 'scheduled'; }
    if (dto.status === 'closed') set.closedAt = new Date();
    await db.update(wellbeingRequests).set(set).where(eq(wellbeingRequests.id, id));
    if (dto.sessionAt) this.notify.notifyUsers(r.centreId, [r.requesterId], 'Counselling session scheduled', `${new Date(dto.sessionAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Join from the app.`, { data: { type: 'wellbeing', id } });
    if (dto.status === 'closed') this.notify.notifyUsers(r.centreId, [r.requesterId], 'Your counselling request is closed', 'You can open a new request any time.', { data: { type: 'wellbeing', id } });
    return { ok: true };
  }

  /** Super-admin: manage experts (platform-level, no centre). */
  @Get('experts') @Roles('SUPER_ADMIN', 'EXPERT') experts() { return this.dbs.db.select({ id: users.id, name: users.name, email: users.email, mobile: users.mobile }).from(users).where(eq(users.role, 'EXPERT')); }
  @Post('experts') @Roles('SUPER_ADMIN') async addExpert(@Body() dto: ExpertDto) { const [row] = await this.dbs.db.insert(users).values({ centreId: null, name: dto.name, email: dto.email.toLowerCase(), mobile: dto.mobile, role: 'EXPERT' }).returning(); return row; }

  /** Tips / articles from experts, visible to every coaching's students and parents. */
  @Get('posts') async posts(@CurrentUser() u: JwtUser) { const aud = u.role === 'PARENT' ? ['all', 'parents'] : u.role === 'STUDENT' ? ['all', 'students'] : ['all', 'students', 'parents']; return this.dbs.db.select({ p: wellbeingPosts, by: users.name }).from(wellbeingPosts).innerJoin(users, eq(users.id, wellbeingPosts.expertId)).where(inArray(wellbeingPosts.audience, aud)).orderBy(desc(wellbeingPosts.publishedAt)).limit(50).then((r) => r.map((x) => ({ ...x.p, by: x.by }))); }
  @Post('posts') @Roles('SUPER_ADMIN', 'EXPERT') async post(@CurrentUser() u: JwtUser, @Body() dto: PostDto) { const [row] = await this.dbs.db.insert(wellbeingPosts).values({ expertId: u.id, title: dto.title, body: dto.body, audience: dto.audience || 'all' }).returning(); return row; }

  /** Owner: counts only — never the content. */
  @Get('summary') @Roles('SUPER_ADMIN', 'ADMIN') async summary(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const rows = await this.dbs.db.select({ status: wellbeingRequests.status, category: wellbeingRequests.category, n: sql<number>`count(*)` }).from(wellbeingRequests).where(eq(wellbeingRequests.centreId, centreId)).groupBy(wellbeingRequests.status, wellbeingRequests.category);
    const byStatus: Record<string, number> = {}, byCategory: Record<string, number> = {}; rows.forEach((r) => { byStatus[r.status] = (byStatus[r.status] || 0) + Number(r.n); byCategory[LABELS[r.category] || r.category] = (byCategory[LABELS[r.category] || r.category] || 0) + Number(r.n); });
    return { total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus, byCategory, note: 'Conversations are confidential between the student/parent and NextEdge counsellors.' };
  }
}
const LABELS: Record<string, string> = { 'exam-stress': 'Exam stress', anxiety: 'Anxiety / low mood', focus: 'Focus & study habits', family: 'Family / home', bullying: 'Bullying / peer issues', career: 'Career confusion', other: 'Something else' };
