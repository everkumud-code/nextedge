import { ForbiddenException } from '@nestjs/common';
import { JwtUser } from './current-user.decorator';
// Returns the centre the caller may act in. SUPER_ADMIN must pass ?centreId=; others are locked to their own.
export function centreOf(user: JwtUser, requested?: string): string {
  if (user.role === 'SUPER_ADMIN' || user.role === 'EXPERT') { if (!requested) throw new ForbiddenException('Select a centre first (admin panel: sidebar → Open centre; API: pass ?centreId=<centre id>).'); return requested; }
  if (!user.centreId) throw new ForbiddenException('User has no centre');
  return user.centreId;
}
