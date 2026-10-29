import { Controller, Get, HttpException, Query, Res } from '@nestjs/common';
import { and, eq, getTableColumns, getTableName, is, sql } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import { DbService } from '../db/db.service';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { RedisService } from '../common/redis.service';

const TABLES = Object.values(schema).filter((t) => is(t, PgTable)) as PgTable[];
const SECRET = /(key|secret|salt|pass|channels|firebase|token)/i;   // provider keys in the settings rows never leave in an owner's backup (other tables keep columns like fileKey)
const SKIP_TENANT = new Set(['device_tokens', 'login_log']);        // not the school's data

/** A downloadable copy of the data as one JSON file: the owner gets their own centre, the platform team can take everything. */
@Controller('backup')
export class BackupController {
  constructor(private dbs: DbService, private redis: RedisService) {}

  private async stream(res: any, name: string, centreId: string | null, withFiles: boolean) {
    const db = this.dbs.db; res.status(200).setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    const counts: Record<string, number> = {}; const skipped: string[] = []; res.write(`{"meta":${JSON.stringify({ app: 'NextEdge', takenAt: new Date().toISOString(), scope: centreId ? 'centre' : 'platform', centreId, includesFiles: withFiles, note: 'Provider keys and secrets are not included in a centre backup.' })},"tables":{`); let first = true;
    for (const t of TABLES) {
      const tn = getTableName(t); const cols = getTableColumns(t) as Record<string, any>; const scoped = centreId && !(tn === 'centres' ? false : cols.centreId === undefined);
      if (centreId && (SKIP_TENANT.has(tn) || (tn !== 'centres' && !cols.centreId))) { skipped.push(tn); continue; }
      const where = centreId ? (tn === 'centres' ? eq(cols.id, centreId) : eq(cols.centreId, centreId)) : undefined; const rows: any[] = []; const pageSize = 1000; let off = 0;
      res.write(`${first ? '' : ','}${JSON.stringify(tn)}:[`); first = false; let n = 0;
      for (;;) {
        const q = db.select().from(t as any); const page: any[] = await (where ? (q as any).where(where) : q).limit(pageSize).offset(off); if (!page.length) break;
        for (const r of page) { const o: any = { ...r }; if (centreId && (tn === 'centre_settings' || tn === 'centres')) for (const k of Object.keys(o)) if (SECRET.test(k) && o[k] != null && k !== 'centreId') o[k] = '***'; if (tn === 'files' && !withFiles) for (const k of Object.keys(o)) if (/data|base64|content|bytes/i.test(k)) o[k] = null; res.write(`${n ? ',' : ''}${JSON.stringify(o)}`); n++; }
        off += pageSize; if (page.length < pageSize) break;
      }
      res.write(']'); counts[tn] = n; void rows; void scoped;
    }
    res.write(`},"counts":${JSON.stringify(counts)},"skipped":${JSON.stringify(skipped)}}`); res.end();
  }

  /** Owner (or the super admin inside a centre). */
  @Get('centre') @Roles('SUPER_ADMIN', 'ADMIN') async centre(@CurrentUser() u: JwtUser, @Res() res: any, @Query('centreId') c?: string, @Query('files') files?: string) {
    const centreId = centreOf(u, c); if ((await this.redis.hit(`backup:${u.id}`, 3600)) > 6) throw new HttpException('Backups are limited to a few per hour. Please try again later.', 429);
    const [ce] = await this.dbs.db.select({ name: schema.centres.name }).from(schema.centres).where(eq(schema.centres.id, centreId)); const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    return this.stream(res, `${(ce?.name || 'centre').replace(/[^A-Za-z0-9]+/g, '-')}-backup-${day}.json`, centreId, files === '1');
  }
  /** The platform team: every centre. */
  @Get('platform') @Roles('SUPER_ADMIN') async platform(@CurrentUser() u: JwtUser, @Res() res: any, @Query('files') files?: string) {
    if ((await this.redis.hit(`backup:${u.id}`, 3600)) > 6) throw new HttpException('Backups are limited to a few per hour. Please try again later.', 429); const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    return this.stream(res, `nextedge-platform-backup-${day}.json`, null, files === '1');
  }
}
