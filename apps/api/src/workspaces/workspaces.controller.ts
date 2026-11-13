import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Put, Req } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { centres } from '../db/schema';
import { Public, Roles } from '../common/auth.guard';
import { hostToSlug, slugError, suggestSlug } from './workspaces';

export const workspaceDomain = () => (process.env.WORKSPACE_DOMAIN || 'nextsoftwares.in').trim().toLowerCase();

/** Is this address already used by a sibling product (NextFit / NextGlow / NextCare)? OTHER_PRODUCT_CHECK_URLS = comma-separated URLs that end where the slug goes. Best effort: an unreachable product does not block. */
async function takenElsewhere(slug: string): Promise<boolean> {
  for (const base of String(process.env.OTHER_PRODUCT_CHECK_URLS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    try { const r = await fetch(base + encodeURIComponent(slug), { signal: AbortSignal.timeout(2500) }); if (r.ok && (await r.json() as any).found) return true; } catch { /* that product is not reachable now */ }
  }
  return false;
}

@Injectable()
export class WorkspaceService {
  constructor(private dbs: DbService) {}
  /** A free address for this name (used when a client is created). */
  async freeSlug(name: string, wanted?: string): Promise<string> {
    const taken = new Set((await this.dbs.db.select({ s: centres.slug }).from(centres)).map((r) => r.s).filter((s): s is string => !!s));
    if (wanted) { const e = slugError(wanted); if (e) throw new BadRequestException(e); if (taken.has(wanted) || await takenElsewhere(wanted)) throw new BadRequestException(`The address “${wanted}” is already used by another client.`); return wanted; }
    let slug = suggestSlug(name, taken); for (let i = 0; i < 20 && await takenElsewhere(slug); i++) { taken.add(slug); slug = suggestSlug(name, taken); }
    return slug;
  }
  /** Gives every client that has no address one (existing clients when this feature arrives). Safe to run at every start. */
  async ensureSlugs() {
    const db = this.dbs.db; const missing = await db.select({ id: centres.id, name: centres.name }).from(centres).where(isNull(centres.slug)); if (!missing.length) return 0;
    const taken = new Set((await db.select({ s: centres.slug }).from(centres)).map((r) => r.s).filter((s): s is string => !!s));
    for (const c of missing) { const s = suggestSlug(c.name, taken); taken.add(s); await db.update(centres).set({ slug: s }).where(eq(centres.id, c.id)); }
    return missing.length;
  }
}

/** Workspace addresses: <client>.nextsoftwares.in. The login page asks "which workspace is this host?", the portal checks an address, the platform team can change one. */
@Controller('workspace')
export class WorkspaceController {
  constructor(private dbs: DbService, private svc: WorkspaceService) {}
  private async bySlug(slug: string) { const [c] = await this.dbs.db.select({ id: centres.id, name: centres.name, city: centres.city, type: centres.institutionType, slug: centres.slug }).from(centres).where(eq(centres.slug, slug)); return c || null; }

  @Public() @Get('config') config() { return { domain: workspaceDomain() }; }

  /** Which workspace is this host? Used by the login page when someone opens irongym.nextsoftwares.in. */
  @Public() @Get('by-host') async byHost(@Req() req: any) {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || ''); const slug = hostToSlug(host, workspaceDomain()); if (!slug) return { found: false };
    const c = await this.bySlug(slug); return c ? { found: true, id: c.id, slug: c.slug, name: c.name, city: c.city, type: c.type } : { found: false, slug };
  }
  /** Does this address exist? (the portal asks before sending someone there). Reveals only the name and city of an address the visitor already typed. */
  @Public() @Get('check/:slug') async check(@Param('slug') slug: string) {
    const s = String(slug || '').toLowerCase(); if (slugError(s) && !/^[a-z0-9-]{3,30}$/.test(s)) return { found: false }; const c = await this.bySlug(s); return c ? { found: true, product: 'nextedge', slug: c.slug, name: c.name, city: c.city } : { found: false };
  }
  /** For the server's own sync script only (needs the shared key): every address and its product. */
  @Public() @Get('internal/list') async list(@Req() req: any) {
    const key = process.env.NEXTSOFT_INTERNAL_KEY; if (!key || req.headers['x-internal-key'] !== key) throw new ForbiddenException();
    return (await this.dbs.db.select({ slug: centres.slug, name: centres.name }).from(centres)).filter((r) => r.slug).map((r) => ({ slug: r.slug, product: 'nextedge', name: r.name }));
  }

  /** Platform team: change a client's address. Old links stop working, so tell the client. */
  @Put('centre/:id') @Roles('SUPER_ADMIN') async set(@Param('id') id: string, @Body() b: { slug: string }) {
    const slug = String(b?.slug || '').trim().toLowerCase(); const e = slugError(slug); if (e) throw new BadRequestException(e);
    const [c] = await this.dbs.db.select({ id: centres.id }).from(centres).where(eq(centres.id, id)); if (!c) throw new NotFoundException();
    const [other] = await this.dbs.db.select({ id: centres.id }).from(centres).where(and(eq(centres.slug, slug), ne(centres.id, id))); if (other || await takenElsewhere(slug)) throw new BadRequestException(`The address “${slug}” is already used by another client.`);
    await this.dbs.db.update(centres).set({ slug }).where(eq(centres.id, id)); return { ok: true, slug, address: `${slug}.${workspaceDomain()}` };
  }
}
