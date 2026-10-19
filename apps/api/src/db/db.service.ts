import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly client = postgres(process.env.DATABASE_URL!, { max: 5 });
  readonly db: PostgresJsDatabase<typeof schema> = drizzle(this.client, { schema });
  async onModuleDestroy() { await this.client.end(); }
}
