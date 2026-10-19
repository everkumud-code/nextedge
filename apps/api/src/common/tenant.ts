import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from './current-user.decorator';
// Returns the centre the caller may act in. SUPER_ADMIN must pass ?centreId=; others are locked to their own.
export function centreOf(user: JwtUser, requested?: string): string {
  if (user.role === 'SUPER_ADMIN') { if (!requested) throw new ForbiddenException('centreId required for super admin'); return requested; }
  if (!user.centreId) throw new ForbiddenException('User has no centre');
  return user.centreId;
}
