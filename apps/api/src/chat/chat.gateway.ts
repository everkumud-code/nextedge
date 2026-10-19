import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { messages, students, users } from '../db/schema';

type U = { id: string; role: string; centreId: string | null; name: string };
const BANNED = (process.env.CHAT_BANNED_WORDS || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);

/** Rooms: batch:<batchId> (whole batch + faculty), parent:<parentUserId> (parent <-> centre staff), dm:<a>_<b> (student <-> faculty). Phone numbers are never sent. */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  constructor(private jwt: JwtService, private dbs: DbService) {}

  async handleConnection(socket: Socket) {
    try { const token = (socket.handshake.auth?.token || socket.handshake.headers.authorization || '').replace('Bearer ', ''); socket.data.user = await this.jwt.verifyAsync(token); }
    catch { socket.emit('error', 'Login required'); socket.disconnect(); return; }
    const rooms = await this.allowedRooms(socket.data.user); rooms.forEach((r) => socket.join(r)); socket.emit('rooms', rooms);
  }

  @SubscribeMessage('send')
  async send(@ConnectedSocket() socket: Socket, @MessageBody() body: { room: string; text: string }) {
    const u: U = socket.data.user; const text = (body.text || '').trim().slice(0, 2000);
    if (!text || !socket.rooms.has(body.room)) return { ok: false, error: 'Not allowed in this room' };
    if (BANNED.some((w) => text.toLowerCase().includes(w))) return { ok: false, error: 'Message blocked by the centre’s word filter' };
    const [row] = await this.dbs.db.insert(messages).values({ centreId: u.centreId!, room: body.room, senderId: u.id, senderName: u.name, senderRole: u.role, text }).returning();
    this.server.to(body.room).emit('message', row);
    return { ok: true, id: row.id };
  }

  /** Which rooms this user may read/post in. */
  async allowedRooms(u: U): Promise<string[]> {
    const db = this.dbs.db; if (!u.centreId && u.role !== 'SUPER_ADMIN') return [];
    if (u.role === 'ADMIN' || u.role === 'FACULTY') {
      const parents = await db.select({ id: users.id }).from(users).where(and(eq(users.centreId, u.centreId!), eq(users.role, 'PARENT')));
      const bs = await db.selectDistinct({ batchId: students.batchId }).from(students).where(eq(students.centreId, u.centreId!));
      return [...bs.map((b) => b.batchId).filter(Boolean).map((b) => `batch:${b}`), ...parents.map((p) => `parent:${p.id}`), `staff:${u.centreId}`];
    }
    if (u.role === 'STUDENT') { const kids = await db.select({ batchId: students.batchId }).from(students).where(eq(students.userId, u.id)); return kids.map((k) => k.batchId).filter(Boolean).map((b) => `batch:${b}`); }
    if (u.role === 'PARENT') return [`parent:${u.id}`];
    return [];
  }
}
