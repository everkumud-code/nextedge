import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// One Redis client for OTPs, rate limits and (later) BullMQ queues. REDIS_URL unset -> in-memory fallback for local dev.
@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 }) : null;
  private mem = new Map<string, { v: string; exp: number }>();

  async get(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);
    const r = this.mem.get(key); if (!r || r.exp < Date.now()) { this.mem.delete(key); return null; } return r.v;
  }
  async set(key: string, value: string, ttlSec: number) {
    if (this.client) { await this.client.set(key, value, 'EX', ttlSec); return; }
    this.mem.set(key, { v: value, exp: Date.now() + ttlSec * 1000 });
  }
  async del(key: string) { if (this.client) await this.client.del(key); else this.mem.delete(key); }
  /** Increments a counter with a window; returns the new count. */
  async hit(key: string, windowSec: number): Promise<number> {
    if (this.client) { const n = await this.client.incr(key); if (n === 1) await this.client.expire(key, windowSec); return n; }
    const cur = Number((await this.get(key)) || 0) + 1; const r = this.mem.get(key);
    this.mem.set(key, { v: String(cur), exp: r?.exp ?? Date.now() + windowSec * 1000 }); return cur;
  }
  async onModuleDestroy() { await this.client?.quit(); }
}
