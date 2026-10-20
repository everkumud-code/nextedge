import { Body, Controller, Get, Param, Post, Put, Query, BadRequestException } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { staffPermissions, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { MODULES, FACULTY_DEFAULT } from '../common/permissions';
import { label } from '../common/roles';

class StaffDto { @IsString() name: string; @IsString() @Length(10, 10) mobile: string; @IsOptional() @IsString() email?: string; @IsIn(['FACULTY', 'STAFF', 'ADMIN']) role: string; @IsOptional() @IsString() title?: string; @IsOptional() @IsArray() modules?: string[]; }
class UpdateDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() email?: string; @IsOptional() @IsString() title?: string; @IsOptional() @IsArray() modules?: string[]; @IsOptional() active?: boolean; @IsOptional() @IsIn(['FACULTY', 'STAFF', 'ADMIN']) role?: string; }

/** Owner (ADMIN) manages staff and what each one may open. */
@Controller('staff')
@Roles('SUPER_ADMIN', 'ADMIN')
export class StaffController {
  constructor(private dbs: DbService) {}

  @Get('modules') modules() { return MODULES.map((m) => ({ key: m, label: LABELS[m] })); }

  @Get() async list(@CurrentUser() u: JwtUser, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const rows = await db.select().from(users).where(and(eq(users.centreId, centreId), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF'])));
    const perms = rows.length ? await db.select().from(staffPermissions).where(inArray(staffPermissions.userId, rows.map((r) => r.id))) : [];
    return rows.map((r) => { const p = perms.find((x) => x.userId === r.id); return { id: r.id, name: r.name, mobile: r.mobile, email: r.email, role: r.role, roleLabel: label(r.role), title: p?.title, active: p ? p.active : true, modules: r.role === 'ADMIN' ? [...MODULES] : p ? JSON.parse(p.modules) : r.role === 'FACULTY' ? FACULTY_DEFAULT : [], isOwner: r.id === u.id }; });
  }

  @Post() async create(@CurrentUser() u: JwtUser, @Body() dto: StaffDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const dup = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, dto.mobile), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF'])));
    if (dup.length) throw new BadRequestException('A staff member with this mobile already exists');
    const mods = (dto.modules || (dto.role === 'FACULTY' ? FACULTY_DEFAULT : [])).filter((m) => (MODULES as readonly string[]).includes(m));
    const [user] = await db.insert(users).values({ centreId, name: dto.name, mobile: dto.mobile, email: dto.email?.toLowerCase(), role: dto.role as any }).returning();
    if (dto.role !== 'ADMIN') await db.insert(staffPermissions).values({ userId: user.id, centreId, modules: JSON.stringify(mods), title: dto.title });
    return { ...user, modules: dto.role === 'ADMIN' ? MODULES : mods };
  }

  @Put(':id') async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdateDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.centreId, centreId))); if (!user) throw new BadRequestException('Not found');
    if (user.id === u.id && (dto.active === false || (dto.role && dto.role !== 'ADMIN'))) throw new BadRequestException('You cannot demote or deactivate yourself');
    const set: any = {}; if (dto.name) set.name = dto.name; if (dto.email !== undefined) set.email = dto.email?.toLowerCase() || null; if (dto.role) set.role = dto.role;
    if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, id));
    const role = dto.role || user.role;
    if (role !== 'ADMIN') {
      const [p] = await db.select().from(staffPermissions).where(eq(staffPermissions.userId, id));
      const mods = dto.modules ? dto.modules.filter((m) => (MODULES as readonly string[]).includes(m)) : p ? JSON.parse(p.modules) : (role === 'FACULTY' ? FACULTY_DEFAULT : []);
      const vals = { userId: id, centreId, modules: JSON.stringify(mods), title: dto.title ?? p?.title, active: dto.active ?? p?.active ?? true };
      if (p) await db.update(staffPermissions).set(vals).where(eq(staffPermissions.userId, id)); else await db.insert(staffPermissions).values(vals);
    } else await db.delete(staffPermissions).where(eq(staffPermissions.userId, id));
    return { ok: true };
  }
}
const LABELS: Record<string, string> = { students: 'Students & batches', attendance: 'Attendance', fees: 'Fees & receipts', study: 'Study material', live: 'Live classes', tests: 'Tests & results', homework: 'Homework', notices: 'Notices', chat: 'Chat', timetable: 'Timetable', doubts: 'Doubt box', leaves: 'Leave requests', feedback: 'Parent feedback', enquiries: 'Enquiries / leads', reports: 'Reports', staff: 'Staff management', wellbeing: 'Wellbeing & counselling' };
