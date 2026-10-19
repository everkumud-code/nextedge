import { Body, Controller, Delete, Get, Param, Post, Query, BadRequestException } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { facultyBatches, timetableSlots, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';

class SlotDto { @IsString() batchId: string; @IsInt() @Min(0) @Max(6) weekday: number; @Matches(/^\d\d:\d\d$/) startTime: string; @Matches(/^\d\d:\d\d$/) endTime: string; @IsString() subject: string; @IsOptional() @IsString() facultyId?: string; @IsOptional() @IsString() room?: string; }
class FacultyDto { @IsString() name: string; @IsString() mobile: string; }
class FacultyBatchDto { @IsString() facultyId: string; @IsString() batchId: string; @IsOptional() @IsString() subject?: string; }

@Controller('timetable')
export class TimetableController {
  constructor(private dbs: DbService) {}

  @Get() list(@CurrentUser() u: JwtUser, @Query('batchId') batchId?: string, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); return this.dbs.db.select().from(timetableSlots).where(batchId ? and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.batchId, batchId)) : eq(timetableSlots.centreId, centreId));
  }
  /** Adds a slot; refuses if the faculty or the batch already has a class overlapping that time. */
  @Post() @Roles('SUPER_ADMIN', 'ADMIN') async add(@CurrentUser() u: JwtUser, @Body() dto: SlotDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c);
    const same = await this.dbs.db.select().from(timetableSlots).where(and(eq(timetableSlots.centreId, centreId), eq(timetableSlots.weekday, dto.weekday)));
    const overlap = (s: typeof same[number]) => s.startTime < dto.endTime && dto.startTime < s.endTime;
    const clash = same.find((s) => overlap(s) && (s.batchId === dto.batchId || (dto.facultyId && s.facultyId === dto.facultyId)));
    if (clash) throw new BadRequestException(`Clashes with ${clash.subject} ${clash.startTime}–${clash.endTime} (${clash.batchId === dto.batchId ? 'same batch' : 'same faculty'})`);
    const [row] = await this.dbs.db.insert(timetableSlots).values({ ...dto, centreId }).returning(); return row;
  }
  @Delete(':id') @Roles('SUPER_ADMIN', 'ADMIN') async remove(@CurrentUser() u: JwtUser, @Param('id') id: string, @Query('centreId') c?: string) {
    await this.dbs.db.delete(timetableSlots).where(and(eq(timetableSlots.id, id), eq(timetableSlots.centreId, centreOf(u, c)))); return { ok: true };
  }

  @Get('faculty') @Roles('SUPER_ADMIN', 'ADMIN', 'FACULTY') faculty(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    return this.dbs.db.select({ id: users.id, name: users.name, mobile: users.mobile }).from(users).where(and(eq(users.centreId, centreOf(u, c)), eq(users.role, 'FACULTY')));
  }
  @Post('faculty') @Roles('SUPER_ADMIN', 'ADMIN') async addFaculty(@CurrentUser() u: JwtUser, @Body() dto: FacultyDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(users).values({ centreId: centreOf(u, c), name: dto.name, mobile: dto.mobile, role: 'FACULTY' }).returning(); return row;
  }
  @Post('faculty-batch') @Roles('SUPER_ADMIN', 'ADMIN') async link(@CurrentUser() u: JwtUser, @Body() dto: FacultyBatchDto, @Query('centreId') c?: string) {
    const [row] = await this.dbs.db.insert(facultyBatches).values({ ...dto, centreId: centreOf(u, c) }).returning(); return row;
  }
}
