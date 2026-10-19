import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsArray, IsIn, IsString } from 'class-validator';
import { and, eq, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { attendance } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class MarkDto {
  @IsString() batchId: string;
  @IsString() date: string; // YYYY-MM-DD
  @IsArray() marks: { studentId: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE' }[];
}

@Controller('attendance')
@Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY')
export class AttendanceController {
  constructor(private dbs: DbService) {}

  // One-tap roll call: replaces that day's rows for the batch, then inserts fresh.
  @Post() async mark(@CurrentUser() u: JwtUser, @Body() dto: MarkDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    await this.dbs.db.delete(attendance).where(and(eq(attendance.centreId, centreId), eq(attendance.batchId, dto.batchId), eq(attendance.date, dto.date)));
    if (dto.marks.length) await this.dbs.db.insert(attendance).values(dto.marks.map((m) => ({ ...m, centreId, batchId: dto.batchId, date: dto.date, markedBy: u.id })));
    return { ok: true, count: dto.marks.length };
    // TODO Phase 1: push "Reached" notification to parent on PRESENT; WhatsApp fallback on ABSENT.
  }

  @Get() list(@CurrentUser() u: JwtUser, @Query('batchId') batchId: string, @Query('date') date: string, @Query('centreId') c?: string) {
    return this.dbs.db.select().from(attendance).where(and(eq(attendance.centreId, centreOf(u, c)), eq(attendance.batchId, batchId), eq(attendance.date, date)));
  }

  @Get('summary') summary(@CurrentUser() u: JwtUser, @Query('batchId') batchId: string, @Query('centreId') c?: string) {
    return this.dbs.db.select({
      studentId: attendance.studentId,
      present: sql<number>`count(*) filter (where ${attendance.status} in ('PRESENT','LATE'))`,
      total: sql<number>`count(*)`,
    }).from(attendance).where(and(eq(attendance.centreId, centreOf(u, c)), eq(attendance.batchId, batchId))).groupBy(attendance.studentId);
  }
}
