import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centreSettings, centres, couponRedemptions, coupons, platformTeam } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { PlatformService } from './platform.service';
import { cleanInput } from './coupons';

/** Offers & discounts: the owner makes coupon codes and gives them to clients (schools / coaching). Managers can give an existing code to a client; making, changing and deleting codes stays with the owner because it is money. */
@Controller('platform/coupons')
@Roles('SUPER_ADMIN')
export class CouponsController {
  constructor(private dbs: DbService, private svc: PlatformService) {}
  private async ownerOnly(u: JwtUser) { const [t] = await this.dbs.db.select({ id: platformTeam.userId }).from(platformTeam).where(eq(platformTeam.userId, u.id)); if (t) throw new ForbiddenException('Only the platform owner can create or change coupons.'); }
  private shape(c: typeof coupons.$inferSelect) { return { id: c.id, code: c.code, title: c.title || '', kind: c.kind, value: Number(c.value), plans: JSON.parse(c.plans || '[]'), scope: c.scope, validFrom: c.validFrom, validTo: c.validTo, maxUses: c.maxUses, usedCount: c.usedCount, active: c.active, createdAt: c.createdAt }; }

  /** All coupons, and which clients currently have one attached. */
  @Get() async list() {
    const db = this.dbs.db; const rows = await db.select().from(coupons).orderBy(sql`${coupons.createdAt} desc`);
    const attached = await db.select({ centreId: centres.id, name: centres.name, type: centres.institutionType, plan: centres.plan, code: centreSettings.couponCode }).from(centreSettings).innerJoin(centres, eq(centres.id, centreSettings.centreId)).where(isNotNull(centreSettings.couponCode)).orderBy(centres.name);
    const used = await db.select({ code: coupons.code, centre: centres.name, discount: couponRedemptions.discount, at: couponRedemptions.createdAt }).from(couponRedemptions).innerJoin(coupons, eq(coupons.id, couponRedemptions.couponId)).innerJoin(centres, eq(centres.id, couponRedemptions.centreId)).orderBy(sql`${couponRedemptions.createdAt} desc`).limit(100);
    return { coupons: rows.map((c) => ({ ...this.shape(c), attached: attached.filter((a) => a.code === c.code).length })), attached, used: used.map((u) => ({ ...u, discount: Number(u.discount) })) };
  }

  @Post() async create(@CurrentUser() u: JwtUser, @Body() b: any) {
    await this.ownerOnly(u); const r = cleanInput(b); if ('error' in r) throw new BadRequestException(r.error); const v = r.ok;
    const [dup] = await this.dbs.db.select({ id: coupons.id }).from(coupons).where(eq(coupons.code, v.code)); if (dup) throw new BadRequestException(`The code ${v.code} already exists. Pick another one.`);
    const [row] = await this.dbs.db.insert(coupons).values({ code: v.code, title: v.title || null, kind: v.kind, value: String(v.value), plans: JSON.stringify(v.plans), scope: v.scope, validFrom: v.validFrom, validTo: v.validTo, maxUses: v.maxUses, active: v.active }).returning();
    return this.shape(row);
  }

  @Put(':id') async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() b: any) {
    await this.ownerOnly(u); const [cur] = await this.dbs.db.select().from(coupons).where(eq(coupons.id, id)); if (!cur) throw new NotFoundException();
    const r = cleanInput({ ...b, code: cur.code }); if ('error' in r) throw new BadRequestException(r.error); const v = r.ok; // the code itself never changes once made, so clients who typed it keep working
    const [row] = await this.dbs.db.update(coupons).set({ title: v.title || null, kind: v.kind, value: String(v.value), plans: JSON.stringify(v.plans), scope: v.scope, validFrom: v.validFrom, validTo: v.validTo, maxUses: v.maxUses, active: v.active }).where(eq(coupons.id, id)).returning();
    return this.shape(row);
  }

  /** A coupon that was never used or given to anyone is deleted; otherwise it is only switched off so the history stays. */
  @Delete(':id') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string) {
    await this.ownerOnly(u); const db = this.dbs.db; const [cur] = await db.select().from(coupons).where(eq(coupons.id, id)); if (!cur) throw new NotFoundException();
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(centreSettings).where(eq(centreSettings.couponCode, cur.code));
    if (cur.usedCount > 0 || Number(n) > 0) { await db.update(coupons).set({ active: false }).where(eq(coupons.id, id)); return { ok: true, deactivated: true }; }
    await db.delete(coupons).where(eq(coupons.id, id)); return { ok: true, deactivated: false };
  }

  /** Give a coupon to a client. */
  @Post('attach') async attach(@Body() b: { centreId: string; code: string }) { if (!b?.centreId) throw new BadRequestException('Choose a client.'); return this.svc.attachCoupon(b.centreId, b.code); }
  @Post('detach') async detach(@Body() b: { centreId: string }) { if (!b?.centreId) throw new BadRequestException('Choose a client.'); return this.svc.detachCoupon(b.centreId); }
}
