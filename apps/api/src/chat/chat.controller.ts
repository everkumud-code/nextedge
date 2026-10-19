import { Controller, Get, Query, ForbiddenException } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { messages } from '../db/schema';
import { CurrentUser, JwtUser } from '../common/current-user.decorator';
import { Mod } from '../common/permissions';
import { ChatGateway } from './chat.gateway';

@Controller('chat')
@Mod('chat')
export class ChatController {
  constructor(private dbs: DbService, private gw: ChatGateway) {}
  @Get('rooms') rooms(@CurrentUser() u: JwtUser) { return this.gw.allowedRooms(u); }
  /** History, newest first, 50 per page; `before` = ISO timestamp cursor. */
  @Get('history') async history(@CurrentUser() u: JwtUser, @Query('room') room: string, @Query('before') before?: string) {
    const allowed = await this.gw.allowedRooms(u); if (!allowed.includes(room)) throw new ForbiddenException('Not your room');
    const where = before ? and(eq(messages.room, room), lt(messages.createdAt, new Date(before))) : eq(messages.room, room);
    return this.dbs.db.select().from(messages).where(where).orderBy(desc(messages.createdAt)).limit(50);
  }
}
