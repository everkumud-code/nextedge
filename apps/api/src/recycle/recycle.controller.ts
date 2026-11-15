import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { platformTeam } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { RecycleService } from './recycle.service';

/** Recycle bin screen. The platform owner and the team can look and restore; only the owner can approve erasing something for good. */
@Controller('recycle-bin') @Roles('SUPER_ADMIN')
export class RecycleController {
  constructor(private svc: RecycleService, private dbs: DbService) {}
  private async ownerOnly(u: JwtUser) { const [t] = await this.dbs.db.select({ id: platformTeam.userId }).from(platformTeam).where(eq(platformTeam.userId, u.id)); if (t) throw new ForbiddenException('Only the platform owner can approve erasing something for good.'); }
  @Get() list(@Query('status') status?: string, @Query('centre') centre?: string) {
    const s = status === 'restored' || status === 'erased' ? status : 'pending';
    return this.svc.list(s, centre && /^[0-9a-f-]{36}$/i.test(centre) ? centre : undefined);
  }
  @Get('count') count() { return this.svc.pendingCount(); }
  @Post('restore') restore(@CurrentUser() u: JwtUser, @Body() b: { tx?: string }) { return this.svc.restore(String(b?.tx || ''), u.name || u.id); }
  @Post('erase') async erase(@CurrentUser() u: JwtUser, @Body() b: { tx?: string; confirm?: string }) {
    await this.ownerOnly(u);
    if (b?.confirm !== 'ERASE') throw new BadRequestException('Type ERASE to confirm. This cannot be undone.');
    return this.svc.erase(String(b?.tx || ''), u.name || u.id);
  }
}
