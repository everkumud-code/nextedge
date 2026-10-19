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
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Login required');
    try { req.user = await this.jwt.verifyAsync(token); } catch { throw new UnauthorizedException('Session expired, login again'); }
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [ctx.getHandler(), ctx.getClass()]);
    const u = req.user;
    // STAFF counts as FACULTY for role checks; what they may actually touch is decided by their module list.
    const effRole = u.role === 'STAFF' ? 'FACULTY' : u.role;
    if (roles?.length && !roles.includes(effRole)) throw new ForbiddenException('Not allowed for your role');
    const mod = this.reflector.getAllAndOverride<string>('module', [ctx.getHandler(), ctx.getClass()]);
    if (mod && (u.role === 'FACULTY' || u.role === 'STAFF') && !(u.modules || []).includes(mod)) throw new ForbiddenException(`You do not have access to ${mod}. Ask the owner.`);
    // Platform-level switches: feature off for this centre, or centre suspended (read-only for everyone but the owner's subscription page).
    if (u.centreId && u.role !== 'SUPER_ADMIN') {
      const s = await this.platform.settings(u.centreId);
      if (s.status === 'suspended' && req.method !== 'GET' && !req.url.includes('/subscription')) throw new ForbiddenException('This centre’s subscription is suspended. The owner needs to renew.');
      if (mod && s.features.length && !s.features.includes(mod)) throw new ForbiddenException(`${mod} is not included in this centre’s plan.`);
    }
    return true;
  }
}
