import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsIn, IsNumberString, IsOptional, IsString } from 'class-validator';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { feePayments, feePlans, students } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class PlanDto { @IsString() name: string; @IsNumberString() amount: string; @IsIn(['one-time', 'monthly', 'quarterly']) cycle: string; @IsOptional() @IsString() batchId?: string; }
class PaymentDto { @IsString() studentId: string; @IsNumberString() amount: string; @IsIn(['UPI', 'CASH', 'CARD', 'NETBANKING', 'CHEQUE']) mode: any; @IsString() paidOn: string; @IsOptional() @IsString() reference?: string; }

@Controller('fees')
@Roles('SUPER_ADMIN', 'ADMIN')
export class FeesController {
  constructor(private dbs: DbService) {}

  @Get('plans') plans(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(feePlans).where(eq(feePlans.centreId, centreOf(u, c)));
  }
  @Post('plans') async createPlan(@CurrentUser() u: JwtUser, @Body() dto: PlanDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(feePlans).values({ ...dto, centreId: centreOf(u, c) }).returning();
    return row;
  }

  @Get('payments') payments(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select({ id: feePayments.id, studentName: students.name, amount: feePayments.amount, mode: feePayments.mode, paidOn: feePayments.paidOn, receiptNo: feePayments.receiptNo })
      .from(feePayments).innerJoin(students, eq(students.id, feePayments.studentId))
      .where(eq(feePayments.centreId, centreOf(u, c))).orderBy(desc(feePayments.paidOn)).limit(200);
  }

  // Cash/UPI entry by admin. Razorpay webhook (Phase 1) will call the same insert with mode=UPI + reference=payment_id.
  @Post('payments') async record(@CurrentUser() u: JwtUser, @Body() dto: PaymentDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [{ n }] = await this.dbs.db.select({ n: sql<number>`count(*)` }).from(feePayments).where(eq(feePayments.centreId, centreId));
    const receiptNo = `R${new Date().getFullYear()}-${String(Number(n) + 1).padStart(5, '0')}`;
    const [row] = await this.dbs.db.insert(feePayments).values({ ...dto, centreId, receiptNo, recordedBy: u.id }).returning();
    return row;
  }

  @Get('summary') async summary(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const [m] = await this.dbs.db.select({ month: sql<string>`coalesce(sum(${feePayments.amount}) filter (where date_trunc('month', ${feePayments.paidOn}) = date_trunc('month', current_date)), 0)`, total: sql<string>`coalesce(sum(${feePayments.amount}), 0)` })
      .from(feePayments).where(eq(feePayments.centreId, centreId));
    return { collectedThisMonth: Number(m.month), collectedTotal: Number(m.total) };
  }
}
