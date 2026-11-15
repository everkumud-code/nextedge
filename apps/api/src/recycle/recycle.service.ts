import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { auditLog, centres, deletedRows } from '../db/schema';
import { RECYCLED_TABLES } from '../common/destructive';

/**
 * The Recycle bin. A database trigger copies every row that is deleted from a school or coaching table into `deleted_rows` (so it also catches
 * deletes that cascade, and anything a future screen adds). The copy waits there; nothing is erased for good until the platform owner approves it.
 *  - restore: puts the rows back exactly as they were (a student's marks come back together with the exam: same transaction)
 *  - erase:   the owner's approval; the row data is dropped and only a line "what / when / who approved" remains
 */
@Injectable()
export class RecycleService implements OnModuleInit {
  private log = new Logger('Recycle');
  constructor(private dbs: DbService) {}

  async onModuleInit() { try { await this.ensure(); } catch (e: any) { this.log.warn(`Recycle bin triggers not installed: ${e?.message || e}`); } }

  /** Safe to run on every start: creates the table and the trigger if they are missing. */
  async ensure() {
    const db = this.dbs.db;
    await db.execute(sql.raw(`create table if not exists deleted_rows (
      id uuid primary key default gen_random_uuid(), table_name text not null, row_id text, centre_id uuid, label text, data jsonb, tx text,
      status text not null default 'pending', deleted_at timestamp not null default now(), decided_at timestamp, decided_by text)`));
    await db.execute(sql.raw(`create index if not exists deleted_rows_tx_idx on deleted_rows (tx)`));
    await db.execute(sql.raw(`create index if not exists deleted_rows_status_idx on deleted_rows (status, deleted_at desc)`));
    await db.execute(sql.raw(`create or replace function ne_archive_delete() returns trigger language plpgsql as $fn$
      declare j jsonb := to_jsonb(OLD);
      begin
        if current_setting('ne.archive', true) = 'off' then return OLD; end if;
        insert into deleted_rows (table_name, row_id, centre_id, label, data, tx)
        values (TG_TABLE_NAME, j->>'id', nullif(j->>'centre_id', '')::uuid,
                left(coalesce(j->>'name', j->>'title', j->>'receipt_no', j->>'code', j->>'subject', j->>'file_name', j->>'id'), 120), j, txid_current()::text);
        return OLD;
      end $fn$`));
    for (const t of RECYCLED_TABLES) {
      await db.execute(sql.raw(`do $do$ begin if to_regclass('public.${t}') is not null then
        execute 'drop trigger if exists ne_archive on public.${t}'; execute 'create trigger ne_archive after delete on public.${t} for each row execute function ne_archive_delete()'; end if; end $do$`));
    }
  }

  /** What is in the bin, newest first, grouped by the delete that removed it. */
  async list(status: 'pending' | 'restored' | 'erased' = 'pending', centreId?: string) {
    const db = this.dbs.db;
    const rows = await db.select().from(deletedRows).where(centreId ? and(eq(deletedRows.status, status), eq(deletedRows.centreId, centreId)) : eq(deletedRows.status, status)).orderBy(desc(deletedRows.deletedAt)).limit(1500);
    // One click on Delete can be several statements (an exam's marks first, then the exam), and some tables carry no centre. So deletes made within 10 seconds of each other are shown, and brought back, together.
    const clusters: any[] = [];
    for (const r of rows) {
      const t = new Date(r.deletedAt).getTime(); const last = clusters[clusters.length - 1];
      const fits = last && last.minT - t <= 10000 && last.status === r.status && (!last.centreId || !r.centreId || last.centreId === r.centreId);
      const g = fits ? last : (clusters.push({ txs: new Set<string>(), centreId: null, deletedAt: r.deletedAt, minT: t, decidedAt: r.decidedAt, decidedBy: r.decidedBy, status: r.status, items: [] as any[] }), clusters[clusters.length - 1]);
      g.minT = t; g.txs.add(r.tx || r.id); if (!g.centreId && r.centreId) g.centreId = r.centreId;
      g.items.push({ id: r.id, table: r.tableName, label: r.label || r.rowId || '' });
    }
    const list: any[] = clusters.slice(0, 200).map((g) => ({ tx: [...g.txs].slice(0, 40).join(','), centreId: g.centreId, deletedAt: g.deletedAt, decidedAt: g.decidedAt, decidedBy: g.decidedBy, status: g.status, items: g.items }));
    const ids = [...new Set(list.map((g) => g.centreId).filter(Boolean))] as string[];
    const names = ids.length ? await db.select({ id: centres.id, name: centres.name }).from(centres).where(inArray(centres.id, ids)) : [];
    for (const g of list) {
      g.centreName = names.find((n) => n.id === g.centreId)?.name || null;
      // who pressed delete: the nearest DELETE in the audit log of that centre, within a few seconds before
      if (g.centreId) { const at = new Date(g.deletedAt).getTime(); const [a] = await db.select().from(auditLog).where(and(eq(auditLog.centreId, g.centreId), eq(auditLog.method, 'DELETE'), gte(auditLog.at, new Date(at - 20000)), lte(auditLog.at, new Date(at + 3000)))).orderBy(desc(auditLog.at)).limit(1); g.by = a?.userName || null; }
    }
    return list;
  }
  async pendingCount() { const res: any = await this.dbs.db.execute(sql`select count(distinct coalesce(tx, id::text))::int as n from deleted_rows where status = 'pending'`); const r = (res.rows || res)[0]; return { pending: Number(r?.n || 0) }; }

  /** Puts a deleted group back. Rows that need a parent first are retried until nothing more can be placed. */
  async restore(tx: string, by: string) {
    const db = this.dbs.db; if (!tx) throw new BadRequestException('Nothing chosen');
    const keys = tx.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 60);
    let pending = await db.select().from(deletedRows).where(and(eq(deletedRows.status, 'pending'), inArray(deletedRows.tx, keys)));
    if (!pending.length) pending = await db.select().from(deletedRows).where(and(eq(deletedRows.status, 'pending'), inArray(deletedRows.id, keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k)))));
    if (!pending.length) throw new BadRequestException('Nothing waiting under that name');
    const allowed = new Set<string>(RECYCLED_TABLES as readonly string[]); let restored = 0; let lastErr = '';
    for (let pass = 0; pass < 6 && pending.length; pass++) {
      const left: typeof pending = []; let progress = false;
      for (const r of pending) {
        if (!allowed.has(r.tableName) || !r.data) { left.push(r); continue; }
        try {
          await db.execute(sql`insert into ${sql.identifier(r.tableName)} select * from jsonb_populate_record(null::${sql.identifier(r.tableName)}, ${JSON.stringify(r.data)}::jsonb) on conflict do nothing`);
          await db.update(deletedRows).set({ status: 'restored', decidedAt: new Date(), decidedBy: by }).where(eq(deletedRows.id, r.id)); restored++; progress = true;
        } catch (e: any) { lastErr = String(e?.cause?.message || e?.message || e).slice(0, 200); left.push(r); }
      }
      pending = left; if (!progress) break;
    }
    return { restored, failed: pending.length, error: pending.length ? lastErr : null };
  }

  /** The owner's approval to erase for good. Only the line "what / when / who" stays. */
  async erase(tx: string, by: string) {
    const db = this.dbs.db; if (!tx) throw new BadRequestException('Nothing chosen');
    const set = { status: 'erased', data: null, decidedAt: new Date(), decidedBy: by };
    const keys = tx.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 60);
    const r = await db.update(deletedRows).set(set).where(and(eq(deletedRows.status, 'pending'), inArray(deletedRows.tx, keys))).returning({ id: deletedRows.id });
    const r2 = r.length ? r : await db.update(deletedRows).set(set).where(and(eq(deletedRows.status, 'pending'), inArray(deletedRows.id, keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k))))).returning({ id: deletedRows.id });
    return { erased: r2.length };
  }
}
