import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { files } from '../db/schema';
import { Upload, saveFile } from './file-store';
import { Public, Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

type UploadDto = Upload;

/** Small files kept in the database: student/teacher photos, gallery pictures, admission documents. Photos and gallery open by link (unguessable id); documents need a login. */
@Controller('files')
export class FilesController {
  constructor(private dbs: DbService, private jwt: JwtService) {}

  @Post() @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'FACULTY') async upload(@CurrentUser() u: JwtUser, @Body() b: UploadDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const f = await saveFile(db, centreId, b);
    return { ...f, url: `/api/files/${f.id}` };
  }

  /** Metadata of files for one owner (no content), e.g. the documents of an admission application. */
  @Get() @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'FACULTY') async list(@CurrentUser() u: JwtUser, @Query('ownerKind') ownerKind: string, @Query('ownerId') ownerId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const cond = [eq(files.centreId, centreId), eq(files.ownerKind, ownerKind)]; if (ownerId) cond.push(eq(files.ownerId, ownerId));
    return this.dbs.db.select({ id: files.id, name: files.name, mime: files.mime, size: files.size, ownerId: files.ownerId, createdAt: files.createdAt }).from(files).where(and(...cond)).orderBy(desc(files.createdAt)).limit(500);
  }

  /** {ownerId: fileId} of all current photos of one kind in the centre. */
  @Get('photo-map') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'FACULTY') async photoMap(@CurrentUser() u: JwtUser, @Query('kind') kind = 'student-photo', @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const rows = await this.dbs.db.select({ id: files.id, ownerId: files.ownerId }).from(files).where(and(eq(files.centreId, centreId), eq(files.ownerKind, kind)));
    return Object.fromEntries(rows.map((r) => [r.ownerId, r.id]));
  }

  @Public() @Get(':id') async get(@Param('id') id: string, @Req() req: any, @Res() res: any) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException();
    const [f] = await this.dbs.db.select().from(files).where(eq(files.id, id)); if (!f) throw new NotFoundException();
    if (!f.isPublic) {
      const tok = (req.query?.t as string) || (req.headers.authorization || '').replace('Bearer ', ''); if (!tok) throw new UnauthorizedException('Login required');
      let user: any; try { user = await this.jwt.verifyAsync(tok); } catch { throw new UnauthorizedException('Session expired'); }
      if (user.role !== 'SUPER_ADMIN' && user.centreId !== f.centreId) throw new ForbiddenException();
      if (!['SUPER_ADMIN', 'ADMIN', 'STAFF', 'FACULTY'].includes(user.role)) throw new ForbiddenException();
    }
    res.setHeader('Content-Type', f.mime); res.setHeader('Content-Disposition', `inline; filename="${f.name.replace(/"/g, '')}"`); res.setHeader('Cache-Control', f.isPublic ? 'public, max-age=3600' : 'private, no-store');
    res.end(Buffer.from(f.data, 'base64'));
  }

  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); await this.dbs.db.delete(files).where(and(eq(files.id, id), eq(files.centreId, centreId))); return { ok: true };
  }
}
