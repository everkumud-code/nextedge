import { Body, Controller, Get, Param, Post, Put, Query, ForbiddenException } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { homework, homeworkSubmissions, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { myStudents } from '../common/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { downloadUrl, storageReady, uploadUrl } from '../integrations/storage';

class HwDto { @IsString() batchId: string; @IsString() title: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsString() subject?: string; @IsString() dueAt: string; @IsOptional() @IsString() attachmentUrl?: string; }
class SubmitDto { @IsString() studentId: string; @IsOptional() @IsString() text?: string; @IsOptional() @IsArray() fileKeys?: string[]; }
class GradeDto { @IsString() submissionId: string; @IsOptional() @IsString() grade?: string; @IsOptional() @IsString() remark?: string; }

@Controller('homework')
export class HomeworkController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  /** Staff: all, with submission counts. Student/parent: own batch, with own submission + grade. */
  @Get() async list(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; const staff = ['SUPER_ADMIN', 'ADMIN', 'FACULTY'].includes(u.role);
    let mine: { id: string; batchId: string | null }[] = []; let where: any = batchId ? and(eq(homework.centreId, centreId), eq(homework.batchId, batchId)) : eq(homework.centreId, centreId);
    if (!staff) { mine = await myStudents(db, u, centreId); const bids = [...new Set(mine.map((s) => s.batchId).filter((x): x is string => !!x))]; if (!bids.length) return []; where = and(eq(homework.centreId, centreId), inArray(homework.batchId, bids)); }
    const rows = await db.select().from(homework).where(where).orderBy(desc(homework.dueAt)).limit(200);
    if (!rows.length) return [];
    const subs = await db.select().from(homeworkSubmissions).where(inArray(homeworkSubmissions.homeworkId, rows.map((r) => r.id)));
    if (staff) { const counts = await db.select({ batchId: students.batchId }).from(students).where(and(eq(students.centreId, centreId), eq(students.active, true)));
      return rows.map((r) => ({ ...r, submitted: subs.filter((s) => s.homeworkId === r.id).length, total: counts.filter((x) => x.batchId === r.batchId).length, checked: subs.filter((s) => s.homeworkId === r.id && s.checkedAt).length })); }
    return rows.map((r) => ({ ...r, submissions: subs.filter((s) => s.homeworkId === r.id && mine.find((m) => m.id === s.studentId)).map((s) => ({ ...s, fileKeys: JSON.parse(s.fileKeys) })) }));
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async create(@CurrentUser() u: JwtUser, @Body() dto: HwDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [row] = await this.dbs.db.insert(homework).values({ ...dto, centreId, dueAt: new Date(dto.dueAt), createdBy: u.id }).returning();
    const aud = await this.notify.audienceForBatch(centreId, dto.batchId, ['STUDENT']);
    this.notify.notifyUsers(centreId, aud, `Homework: ${dto.title}`, `Due ${new Date(dto.dueAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`, { data: { type: 'homework', id: row.id } });
    return row;
  }

  /** Signed upload URL for a photo/PDF of the answer. */
  @Post('upload-url') async upload(@CurrentUser() u: JwtUser, @Body() b: { filename: string; contentType: string }, @Query('centreId') c?: string) {
    if (!storageReady()) return { error: 'File upload not configured yet. Type your answer instead.' };
    const key = `${centreOf(u, c)}/hw/${u.id}/${Date.now()}-${(b.filename || 'file').replace(/[^\w.\-]/g, '_')}`; return { key, url: await uploadUrl(key, b.contentType || 'application/octet-stream') };
  }
  @Get('file') async file(@Query('key') key: string) { return { url: await downloadUrl(key) }; }

  @Post(':id/submit') async submit(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: SubmitDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const mine = await myStudents(db, u, centreId); if (!mine.find((s) => s.id === dto.studentId)) throw new ForbiddenException('Not your student');
    const [prev] = await db.select().from(homeworkSubmissions).where(and(eq(homeworkSubmissions.homeworkId, id), eq(homeworkSubmissions.studentId, dto.studentId)));
    const vals = { homeworkId: id, studentId: dto.studentId, text: dto.text, fileKeys: JSON.stringify(dto.fileKeys || []), submittedAt: new Date(), grade: null, remark: null, checkedAt: null };
    const [row] = prev ? await db.update(homeworkSubmissions).set(vals).where(eq(homeworkSubmissions.id, prev.id)).returning() : await db.insert(homeworkSubmissions).values(vals).returning();
    const [hw] = await db.select().from(homework).where(eq(homework.id, id));
    return { ...row, late: hw ? row.submittedAt > hw.dueAt : false };
  }

  /** Faculty view: every student in the batch with their submission (or missing). */
  @Get(':id/submissions') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async submissions(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [hw] = await db.select().from(homework).where(and(eq(homework.id, id), eq(homework.centreId, centreId))); if (!hw) return [];
    const sts = await db.select({ id: students.id, name: students.name, rollNo: students.rollNo }).from(students).where(and(eq(students.batchId, hw.batchId), eq(students.active, true)));
    const subs = await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.homeworkId, id));
    return sts.map((s) => { const sub = subs.find((x) => x.studentId === s.id); return { ...s, submission: sub ? { ...sub, fileKeys: JSON.parse(sub.fileKeys), late: sub.submittedAt > hw.dueAt } : null }; });
  }

  @Put(':id/grade') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async grade(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: GradeDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [row] = await db.update(homeworkSubmissions).set({ grade: dto.grade, remark: dto.remark, checkedBy: u.id, checkedAt: new Date() }).where(and(eq(homeworkSubmissions.id, dto.submissionId), eq(homeworkSubmissions.homeworkId, id))).returning();
    if (row) { const [st] = await db.select().from(students).where(eq(students.id, row.studentId)); const [hw] = await db.select().from(homework).where(eq(homework.id, id));
      const ids: string[] = []; if (st?.userId) ids.push(st.userId); const [p] = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, st.parentMobile), eq(users.role, 'PARENT'))); if (p) ids.push(p.id);
      this.notify.notifyUsers(centreId, ids, `Homework checked: ${hw?.title}`, `${dto.grade ? 'Grade ' + dto.grade : 'Checked'}${dto.remark ? ' · ' + dto.remark : ''}`, { data: { type: 'homework', id } }); }
    return row;
  }

  /** One-tap reminder to students who have not submitted. */
  @Post(':id/remind') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async remind(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const rows = await this.submissions(u, id, c); const missing = rows.filter((r) => !r.submission);
    const sts = missing.length ? await this.dbs.db.select({ userId: students.userId }).from(students).where(inArray(students.id, missing.map((m) => m.id))) : [];
    const [hw] = await this.dbs.db.select().from(homework).where(eq(homework.id, id));
    this.notify.notifyUsers(centreId, sts.map((s) => s.userId).filter((x): x is string => !!x), `Reminder: ${hw?.title}`, 'Your homework is still pending. Submit it in the app.', { data: { type: 'homework', id } });
    return { reminded: missing.length };
  }
}
