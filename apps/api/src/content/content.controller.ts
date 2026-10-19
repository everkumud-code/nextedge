import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, inArray, or, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { content, students, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { Mod } from '../common/permissions';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { downloadUrl, storageReady, uploadUrl } from '../integrations/storage';
import { NotificationsService } from '../notifications/notifications.service';

class ContentDto { @IsString() subject: string; @IsString() title: string; @IsIn(['link', 'file', 'video', 'text']) kind: string; @IsOptional() @IsString() batchId?: string; @IsOptional() @IsString() chapter?: string; @IsOptional() @IsString() url?: string; @IsOptional() @IsString() fileKey?: string; @IsOptional() @IsString() body?: string; }
class UploadDto { @IsString() filename: string; @IsString() contentType: string; }

@Controller('content')
@Mod('study')
export class ContentController {
  constructor(private dbs: DbService, private notify: NotificationsService) {}

  /** Students/parents: centre-wide + own batch. Staff: everything. */
  @Get() async list(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db; let where: any = eq(content.centreId, centreId);
    if (u.role === 'STUDENT' || u.role === 'PARENT') {
      const [me] = await db.select({ mobile: users.mobile }).from(users).where(eq(users.id, u.id));
      const kids = await db.select({ batchId: students.batchId }).from(students).where(and(eq(students.centreId, centreId), u.role === 'STUDENT' ? eq(students.userId, u.id) : eq(students.parentMobile, me?.mobile || '')));
      const bids = kids.map((k) => k.batchId).filter((x): x is string => !!x);
      where = and(where, bids.length ? or(isNull(content.batchId), inArray(content.batchId, bids)) : isNull(content.batchId));
    } else if (batchId) where = and(where, eq(content.batchId, batchId));
    return db.select().from(content).where(where).orderBy(desc(content.createdAt)).limit(500);
  }

  /** Step 1 of a file upload: get a signed PUT url; the app PUTs the file there, then POST /content with fileKey. */
  @Post('upload-url') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async upload(@CurrentUser() u: JwtUser, @Body() dto: UploadDto, @Query('centreId') c?: string) {
    if (!storageReady()) return { error: 'File storage not configured (S3_* env). Use a link instead.' };
    const key = `${centreOf(u, c)}/${Date.now()}-${dto.filename.replace(/[^\w.\-]/g, '_')}`;
    return { key, url: await uploadUrl(key, dto.contentType) };
  }
  /** Expiring download link for a stored file (content protection). */
  @Get(':id/file') async file(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.select().from(content).where(and(eq(content.id, id), eq(content.centreId, centreOf(u, c))));
    if (!row?.fileKey) return { error: 'No file' }; return { url: await downloadUrl(row.fileKey) };
  }

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async create(@CurrentUser() u: JwtUser, @Body() dto: ContentDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [row] = await this.dbs.db.insert(content).values({ ...dto, centreId, batchId: dto.batchId || null, createdBy: u.id }).returning();
    const audience = await this.notify.audienceForBatch(centreId, dto.batchId || null, ['STUDENT']);
    this.notify.notifyUsers(centreId, audience, `New ${dto.kind === 'video' ? 'recording' : 'notes'}: ${dto.title}`, `${dto.subject}${dto.chapter ? ' · ' + dto.chapter : ''}`, { data: { type: 'content', id: row.id } });
    return row;
  }
  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    await this.dbs.db.delete(content).where(and(eq(content.id, id), eq(content.centreId, centreOf(u, c)))); return { ok: true };
  }
}
