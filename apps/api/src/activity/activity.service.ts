import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { auditLog, centres, loginLog } from '../db/schema';
import { describe, loggable, scopeOf, survivesClient } from './activity';

const ipOf = (req: any) => String(req?.headers?.['x-forwarded-for'] || req?.ip || '').split(',')[0].trim().slice(0, 64) || null;
const cleanPath = (req: any) => String(req.originalUrl || req.url || '').split('?')[0].replace(/^\/api/, '').slice(0, 200);

/**
 * The activity log: who did what, when, in which client, kept for good.
 *  - client log:   everything people of a client did in it (and what the NextEdge team did inside it in support mode)
 *  - platform log: what the NextEdge owner and team did on the platform itself (clients, plans, offers, team, recycle bin)
 * Written by an interceptor for every add / edit / delete, plus sign-ins (login_log). Nothing in the app can edit or erase it; a database trigger refuses too.
 */
@Injectable()
export class ActivityService implements OnModuleInit {
  private log = new Logger('Activity');
  constructor(private dbs: DbService) {}
  async onModuleInit() { try { await this.ensure(); } catch (e: any) { this.log.warn(`Activity log columns/guard not installed: ${e?.message || e}`); } }

  /** Safe on every start. Older rows (support-mode lines) keep working: they just have no readable action text and are described from their path. */
  async ensure() {
    const db = this.dbs.db;
    for (const c of ['role text', "scope text not null default 'client'", 'action text', 'detail text', 'via text', 'ip text']) await db.execute(sql.raw(`alter table audit_log add column if not exists ${c}`));
    await db.execute(sql.raw('alter table audit_log alter column centre_id drop not null'));
    await db.execute(sql.raw('create index if not exists audit_log_centre_idx on audit_log (centre_id, at desc)'));
    await db.execute(sql.raw("create index if not exists audit_log_scope_idx on audit_log (scope, at desc)"));
    await db.execute(sql.raw(`create or replace function ne_audit_guard() returns trigger language plpgsql as $fn$
      begin
        if current_setting('ne.archive', true) = 'off' then if TG_OP = 'DELETE' then return OLD; end if; return NEW; end if;
        raise exception 'The activity log cannot be changed or erased';
      end $fn$`));
    await db.execute(sql.raw('drop trigger if exists ne_audit_guard on audit_log'));
    await db.execute(sql.raw('create trigger ne_audit_guard before update or delete on audit_log for each row execute function ne_audit_guard()'));
  }

  /** After a successful add / edit / delete (called by the interceptor). Never blocks or fails the request. */
  record(req: any, res?: any) {
    try {
      const u = req.user; const path = cleanPath(req); if (!u?.id || !loggable(req.method, path)) return;
      if (res && typeof res === 'object' && res.ok === false) return; // the action answered "not done"
      const d = describe(req.method, path, req.body); const s = scopeOf(u, path);
      const centreId = survivesClient(path) ? null : s.centreId; if (!centreId && s.scope === 'client') return;
      this.dbs.db.insert(auditLog).values({ centreId, userId: u.id, userName: u.name || null, role: u.role || null, scope: survivesClient(path) ? 'platform' : s.scope, method: String(req.method).toUpperCase(), path, action: d.action, detail: d.detail || null, via: u.support ? 'support' : u.demoFrom ? 'demo' : null, ip: ipOf(req) }).catch(() => {});
    } catch { /* logging must never break the request */ }
  }
  /** A delete that the rules refused is worth a line too. */
  denied(req: any, u: any, why: string) {
    try { const path = cleanPath(req); const s = scopeOf(u, path); if (!u?.id) return; this.dbs.db.insert(auditLog).values({ centreId: s.centreId, userId: u.id, userName: u.name || null, role: u.role || null, scope: s.scope, method: String(req.method).toUpperCase(), path, action: `Not allowed · ${describe(req.method, path).action}`, detail: why.slice(0, 120), via: u.support ? 'support' : null, ip: ipOf(req) }).catch(() => {}); } catch { /* ignore */ }
  }

  /** One page of the log, newest first. scope 'platform' = the platform's own work; otherwise a client (centreId). Sign-ins are merged in from login_log. */
  async list(o: { scope: 'client' | 'platform'; centreId?: string; person?: string; q?: string; area?: string; only?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const db = this.dbs.db; const limit = Math.min(Math.max(o.limit || 50, 1), 200); const offset = Math.max(o.offset || 0, 0); const take = limit + offset;
    const cond: any[] = [o.scope === 'platform' ? eq(auditLog.scope, 'platform') : and(eq(auditLog.centreId, o.centreId!))];
    if (o.person) cond.push(or(ilike(auditLog.userName, `%${o.person}%`), eq(sql`${auditLog.userId}::text`, o.person)));
    if (o.q) cond.push(or(ilike(auditLog.action, `%${o.q}%`), ilike(auditLog.detail, `%${o.q}%`), ilike(auditLog.userName, `%${o.q}%`), ilike(auditLog.path, `%${o.q}%`)));
    if (o.area) cond.push(ilike(auditLog.action, `%· ${o.area}%`));
    if (o.only === 'delete') cond.push(or(eq(auditLog.method, 'DELETE'), ilike(auditLog.action, 'Deleted%'), ilike(auditLog.action, 'Erased%'), ilike(auditLog.action, 'Not allowed%')));
    const from = o.from ? new Date(`${o.from}T00:00:00+05:30`) : null; const to = o.to ? new Date(`${o.to}T23:59:59.999+05:30`) : null;
    if (from && !isNaN(+from)) cond.push(gte(auditLog.at, from)); if (to && !isNaN(+to)) cond.push(lte(auditLog.at, to));
    const rows = await db.select().from(auditLog).where(and(...cond)).orderBy(desc(auditLog.at)).limit(take);

    let logins: any[] = [];
    if (!o.area && o.only !== 'delete') {
      const lc: any[] = [o.scope === 'platform' ? inArray(loginLog.role, ['SUPER_ADMIN']) : eq(loginLog.centreId, o.centreId!)];
      if (o.scope === 'client') lc.push(sql`coalesce(${loginLog.role}, '') <> 'SUPER_ADMIN'`);
      if (o.person) lc.push(ilike(loginLog.name, `%${o.person}%`)); if (o.q) lc.push(or(ilike(loginLog.name, `%${o.q}%`), ilike(loginLog.note, `%${o.q}%`)));
      if (from && !isNaN(+from)) lc.push(gte(loginLog.at, from)); if (to && !isNaN(+to)) lc.push(lte(loginLog.at, to));
      logins = await db.select().from(loginLog).where(and(...lc)).orderBy(desc(loginLog.at)).limit(take);
    }
    const ids = [...new Set([...rows.map((r) => r.centreId), ...logins.map((l) => l.centreId)].filter(Boolean))] as string[];
    const names = ids.length ? await db.select({ id: centres.id, name: centres.name }).from(centres).where(inArray(centres.id, ids)) : [];
    const nm = (id: string | null) => (id ? names.find((n) => n.id === id)?.name || null : null);
    const all = [
      ...rows.map((r) => { const d = describe(r.method, r.path); return { id: r.id, at: r.at, userId: r.userId, userName: r.userName, role: r.role, via: r.via || (r.scope === 'client' && r.role === 'SUPER_ADMIN' ? 'support' : null), centreId: r.centreId, centreName: nm(r.centreId), scope: r.scope, method: r.method, area: (r.action || d.action).split(' · ')[1]?.split(' › ')[0] || d.area, action: r.action || d.action, detail: r.detail || '', path: r.path, ip: r.ip }; }),
      ...logins.map((l) => ({ id: `l-${l.id}`, at: l.at, userId: l.userId, userName: l.name, role: l.role, via: null, centreId: l.centreId, centreName: nm(l.centreId), scope: o.scope, method: 'LOGIN', area: 'Sign-in', action: l.ok ? 'Signed in' : 'Sign-in failed', detail: l.ok ? (l.channel === 'otp' ? 'with a one-time code' : '') : (l.note || ''), path: '', ip: l.ip })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
    const page = all.slice(offset, offset + limit);
    return { items: page, more: all.length > offset + limit };
  }

  /** Client-wise overview for the platform side: every client with its last activity and how busy the last 7 days were. */
  async clients() {
    const res: any = await this.dbs.db.execute(sql`
      select c.id, c.name, c.city, c.plan,
        max(a.at) as last_at,
        (count(a.id) filter (where a.at > now() - interval '7 days'))::int as actions7,
        (count(distinct a.user_id) filter (where a.at > now() - interval '7 days'))::int as people7,
        (count(a.id) filter (where a.at > now() - interval '7 days' and (a.method = 'DELETE' or a.action like 'Not allowed%')))::int as deletes7,
        (count(a.id))::int as total
      from centres c left join audit_log a on a.centre_id = c.id and a.scope = 'client'
      group by c.id order by max(a.at) desc nulls last, c.name`);
    return ((res.rows || res) as any[]).map((r) => ({ id: r.id, name: r.name, city: r.city, plan: r.plan, lastAt: r.last_at, actions7: r.actions7, people7: r.people7, deletes7: r.deletes7, total: r.total }));
  }
}
