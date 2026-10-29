import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException, SetMetadata } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PlatformService } from '../platform/platform.service';

export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
export const Public = () => SetMetadata('public', true);

// Verifies the JWT, attaches req.user, enforces @Roles(). Every tenant query must then filter by user.centreId.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private reflector: Reflector, private platform: PlatformService) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    // PDFs opened by the phone's browser carry a short-lived link token (?t=) instead of a header — only for GET …pdf routes.
    const linkTok = req.method === 'GET' && /\.pdf(\?|$)/.test(req.url || '') ? (req.query?.t as string | undefined) : undefined;
    const token = linkTok || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Login required');
    try { req.user = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException('Session expired, login again'); }
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    const u = req.user;
    // STAFF counts as FACULTY for role checks; what they may actually touch is decided by their module list.
    const effRole = u.role === 'STAFF' ? 'FACULTY' : u.role;
    if (roles?.length && !roles.includes(effRole) && !roles.includes(u.role)) throw new ForbiddenException('Not allowed for your role');
    const mod = this.reflector.getAllAndOverride<string>('module', [ctx.getHandler(), ctx.getClass()]);
    const mods: string[] = u.modules || [];
    // Reading the student/batch list is needed by every teaching module (roll call, marks, homework), so a GET on 'students' passes when any of those is granted.
    const studentRead = mod === 'students' && req.method === 'GET' && mods.some((m) => ['students', 'attendance', 'tests', 'homework', 'fees', 'live', 'study', 'doubts', 'leaves', 'chat', 'timetable'].includes(m));
    if (mod && (u.role === 'FACULTY' || u.role === 'STAFF') && !mods.includes(mod) && !studentRead) throw new ForbiddenException(`You do not have access to ${mod}. Ask the owner.`);
    if (u.role === 'EXPERT' && mod && mod !== 'wellbeing' && mod !== 'notices') throw new ForbiddenException('Counsellors can only use the wellbeing console.');
    // Platform-level switches: feature off for this centre, or centre suspended (read-only for everyone but the owner's subscription page).
    if (u.centreId && u.role !== 'SUPER_ADMIN') {
      const s = await this.platform.settings(u.centreId);
      if (s.status === 'suspended' && req.method !== 'GET' && !req.url.includes('/subscription')) throw new ForbiddenException('This centre’s subscription is suspended. The owner needs to renew.');
      if (mod && s.features.length && !s.features.includes(mod)) throw new ForbiddenException(`${mod} is not included in this centre’s plan.`);
    }
    return true;
  }
}
