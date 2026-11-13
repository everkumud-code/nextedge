import { Body, Controller, Get, Param, Post, Put, Query, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { and, eq, inArray } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { staffPermissions, users } from '../db/schema';
import { Roles } from '../common/auth.guard';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { centreOf } from '../common/tenant';
import { MODULES, FACULTY_DEFAULT } from '../common/permissions';
import { label } from '../common/roles';

class StaffDto { @IsString() name: string; @IsString() @Length(10, 10) mobile: string; @IsOptional() @IsString() email?: string; @IsIn(['FACULTY', 'STAFF', 'ADMIN', 'MANAGER']) role: string; @IsOptional() @IsString() title?: string; @IsOptional() @IsArray() modules?: string[]; }
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
    const owner = await this.ownerOf(centreId); const mayAdmins = u.role === 'SUPER_ADMIN' || u.id === owner;
    return rows.map((r) => { const p = perms.find((x) => x.userId === r.id); const isOwner = r.id === owner; const mgr = r.role === 'STAFF' && /^\s*manager\s*$/i.test(p?.title || '');
      return { id: r.id, name: r.name, mobile: r.mobile, email: r.email, role: r.role, roleLabel: isOwner ? 'Owner' : r.role === 'ADMIN' ? 'Co-owner' : mgr ? 'Manager' : label(r.role), title: p?.title, active: p ? p.active : true, modules: r.role === 'ADMIN' ? [...MODULES] : p ? JSON.parse(p.modules) : r.role === 'FACULTY' ? FACULTY_DEFAULT : [], isOwner: r.id === u.id, theOwner: isOwner, canEdit: u.role === 'SUPER_ADMIN' ? true : isOwner ? false : r.role === 'ADMIN' ? mayAdmins : true, mayAddAdmins: mayAdmins }; });
  }
  /** The owner of a school / coaching is the first Admin login made for it. Only the owner can add, change or switch off other Admins; nobody can change the owner. */
  private async ownerOf(centreId: string): Promise<string | null> { const [o] = await this.dbs.db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.role, 'ADMIN'))).orderBy(users.createdAt).limit(1); return o?.id || null; }

  @Post() async create(@CurrentUser() u: JwtUser, @Body() dto: StaffDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const dup = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, centreId), eq(users.mobile, dto.mobile), inArray(users.role, ['ADMIN', 'FACULTY', 'STAFF'])));
    if (dup.length) throw new BadRequestException('A staff member with this mobile already exists');
    if (dto.role === 'ADMIN' && u.role !== 'SUPER_ADMIN' && u.id !== (await this.ownerOf(centreId))) throw new ForbiddenException('Only the owner can add another Admin (co-owner).');
    const manager = dto.role === 'MANAGER'; const role = manager ? 'STAFF' : dto.role; const title = manager ? dto.title || 'Manager' : dto.title;
    const mods = (dto.modules || (role === 'FACULTY' ? FACULTY_DEFAULT : manager ? (MODULES as readonly string[]).filter((m) => m !== 'staff') : [])).filter((m) => (MODULES as readonly string[]).includes(m)); // a manager runs the school but cannot change who may do what
    const [user] = await db.insert(users).values({ centreId, name: dto.name, mobile: dto.mobile, email: dto.email?.toLowerCase(), role: role as any }).returning();
    await db.insert(staffPermissions).values({ userId: user.id, centreId, modules: JSON.stringify(role === 'ADMIN' ? [] : mods), title: role === 'ADMIN' ? title || 'Co-owner' : title }); // Admins get a row too, so they can be switched off
    return { ...user, modules: role === 'ADMIN' ? MODULES : mods };
  }

  @Put(':id') async update(@CurrentUser() u: JwtUser, @Param('id') id: string, @Body() dto: UpdateDto, @Query('centreId') c?: string) {
    const centreId = centreOf(u, c); const db = this.dbs.db;
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.centreId, centreId))); if (!user) throw new BadRequestException('Not found');
    if (user.id === u.id && (dto.active === false || (dto.role && dto.role !== 'ADMIN'))) throw new BadRequestException('You cannot demote or deactivate yourself');
    const owner = await this.ownerOf(centreId); const isSuper = u.role === 'SUPER_ADMIN';
    if (user.id === owner && user.id !== u.id && !isSuper) throw new ForbiddenException('The owner’s login cannot be changed by anyone else.');
    if (!isSuper && u.id !== owner && (user.role === 'ADMIN' || dto.role === 'ADMIN')) throw new ForbiddenException('Only the owner can change an Admin (co-owner) or make someone one.');
    const set: any = {}; if (dto.name) set.name = dto.name; if (dto.email !== undefined) set.email = dto.email?.toLowerCase() || null; if (dto.role) set.role = dto.role;
    if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, id));
    const role = dto.role || user.role;
    if (role !== 'ADMIN') {
      const [p] = await db.select().from(staffPermissions).where(eq(staffPermissions.userId, id));
      const mods = dto.modules ? dto.modules.filter((m) => (MODULES as readonly string[]).includes(m)) : p ? JSON.parse(p.modules) : (role === 'FACULTY' ? FACULTY_DEFAULT : []);
      const vals = { userId: id, centreId, modules: JSON.stringify(mods), title: dto.title ?? p?.title, active: dto.active ?? p?.active ?? true };
      if (p) await db.update(staffPermissions).set(vals).where(eq(staffPermissions.userId, id)); else await db.insert(staffPermissions).values(vals);
    } else { // Admin: full access always; the row only keeps the title and the on/off switch
      const [p] = await db.select().from(staffPermissions).where(eq(staffPermissions.userId, id)); const vals = { userId: id, centreId, modules: '[]', title: dto.title ?? p?.title ?? 'Co-owner', active: dto.active ?? p?.active ?? true };
      if (p) await db.update(staffPermissions).set(vals).where(eq(staffPermissions.userId, id)); else await db.insert(staffPermissions).values(vals);
    }
    return { ok: true };
  }
}
const LABELS: Record<string, string> = { students: 'Students & batches', attendance: 'Attendance', fees: 'Fees & receipts', study: 'Study material', live: 'Live classes', tests: 'Tests & results', homework: 'Homework', notices: 'Notices', chat: 'Chat', timetable: 'Timetable', doubts: 'Doubt box', leaves: 'Leave requests', feedback: 'Parent feedback', enquiries: 'Enquiries / leads', reports: 'Reports', staff: 'Staff management', wellbeing: 'Wellbeing & counselling', transport: 'Transport', library: 'Library', inventory: 'Inventory', visitors: 'Front desk (visitors, requests)', discipline: 'Discipline', activities: 'Activities & achievements', health: 'Health & medical', planner: 'Planner & lesson diary', events: 'Events & gallery', duties: 'Duties & services', exams: 'Exams & report cards', certificates: 'Certificates (TC, bonafide…)', admissions: 'Online admission', hr: 'HR & payroll', biometric: 'Biometric devices' };
