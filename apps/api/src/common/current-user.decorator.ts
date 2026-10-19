import { createParamDecorator, ExecutionContext } from '@nestjs/common';
export type JwtUser = { id: string; role: string; centreId: string | null; name: string };
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): JwtUser => ctx.switchToHttp().getRequest().user);
