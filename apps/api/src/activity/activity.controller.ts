import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { ActivityService } from './activity.service';

const UUID = /^[0-9a-f-]{36}$/i;
type Q = { person?: string; q?: string; area?: string; only?: string; from?: string; to?: string; limit?: string; offset?: string; centre?: string; scope?: string };

/**
 * The activity log, read-only.
 *  - a client's owner sees the log of their own centre (their people, and what the NextEdge team did inside it)
 *  - the platform owner and team see the platform log, and any client's log (`centre=`; named so it does not trigger support mode)
 */
@Controller('activity') @Roles('ADMIN', 'SUPER_ADMIN')
export class ActivityController {
  constructor(private svc: ActivityService) {}
  private opts(q: Q) { return { person: q.person?.slice(0, 80), q: q.q?.slice(0, 80), area: q.area?.slice(0, 40), only: q.only, from: q.from, to: q.to, limit: Number(q.limit) || 50, offset: Number(q.offset) || 0 }; }

  @Get() list(@CurrentUser() u: JwtUser, @Query() q: Q) {
    if (u.role !== 'SUPER_ADMIN') { if (!u.centreId) throw new BadRequestException('No centre'); return this.svc.list({ ...this.opts(q), scope: 'client', centreId: u.centreId }); }
    if (q.scope === 'platform' || (!q.centre && q.scope !== 'client')) return this.svc.list({ ...this.opts(q), scope: 'platform' });
    if (!q.centre || !UUID.test(q.centre)) throw new BadRequestException('Choose a client');
    return this.svc.list({ ...this.opts(q), scope: 'client', centreId: q.centre });
  }
  /** Client-wise overview (platform side only). */
  @Get('clients') clients(@CurrentUser() u: JwtUser) { if (u.role !== 'SUPER_ADMIN') throw new BadRequestException('Platform side only'); return this.svc.clients(); }
}
