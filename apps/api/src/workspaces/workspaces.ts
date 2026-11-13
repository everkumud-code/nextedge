/** Workspace addresses: every client gets  <slug>.nextsoftwares.in . Pure functions (no database), so they can be self-tested. */

/** Names that must never be a client's address: they are used by the platform itself. */
export const RESERVED = new Set(['www', 'api', 'app', 'apps', 'admin', 'portal', 'login', 'signin', 'signup', 'auth', 'mail', 'email', 'smtp', 'imap', 'ftp', 'ns1', 'ns2', 'dns', 'cdn', 'static', 'assets', 'files', 'img', 'images', 'media', 'status', 'help', 'support', 'docs', 'blog', 'demo', 'test', 'staging', 'dev', 'beta', 'internal', 'root', 'null', 'undefined', 'edge', 'nextedge', 'fit', 'nextfit', 'glow', 'nextglow', 'care', 'nextcare', 'serve', 'nextserve', 'nextsoftwares', 'nextpms', 'pms', 'nextstores', 'stores', 'nextgem', 'gem', 'nextkit', 'kit', 'boombites', 'nextresource', 'nextera', 'billing', 'pay', 'payments', 'webhook', 'webhooks', 'dashboard', 'console', 'account', 'accounts', 'secure', 'security', 'cpanel', 'whm', 'webmail', 'autodiscover']);

export const slugify = (name: string) => String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 30).replace(/-+$/g, '');

/** Returns an error text, or null when the address is acceptable. 3-30 letters, digits and single hyphens; not at the start or end. */
export function slugError(slug: string): string | null {
  const s = String(slug || '');
  if (s.length < 3) return 'The address must have at least 3 characters.'; if (s.length > 30) return 'The address can have at most 30 characters.';
  if (!/^[a-z0-9-]+$/.test(s)) return 'Use only small letters a-z, numbers 0-9 and hyphens.'; if (s.startsWith('-') || s.endsWith('-')) return 'The address cannot start or end with a hyphen.'; if (s.includes('--')) return 'Do not use two hyphens in a row.';
  if (/^\d+$/.test(s)) return 'The address cannot be only numbers.';
  if (RESERVED.has(s)) return `“${s}” is kept for NextSoftwares itself. Choose another address.`;
  return null;
}

/** A free address for a new client: its name as a slug, then name-2, name-3 ... Never returns a reserved or taken one. */
export function suggestSlug(name: string, taken: Set<string>): string {
  let base = slugify(name); if (base.length < 3) base = (base + '-school').replace(/^-/, '').slice(0, 30); if (slugError(base) && !taken.has(base)) { base = base + '-co'; }
  let s = base, n = 2; while (taken.has(s) || slugError(s)) { const suffix = `-${n++}`; s = base.slice(0, 30 - suffix.length).replace(/-+$/, '') + suffix; if (n > 500) return `ws-${Date.now().toString(36)}`; }
  return s;
}

/** The workspace address inside a host name: "irongym.nextsoftwares.in" -> "irongym". Not a workspace (www, the bare domain, another domain, a nested name) -> null. */
export function hostToSlug(host: string, baseDomain: string): string | null {
  const h = String(host || '').toLowerCase().split(':')[0].replace(/\.$/, ''); const b = String(baseDomain || '').toLowerCase();
  if (!b || !h.endsWith('.' + b)) return null; const sub = h.slice(0, -(b.length + 1)); if (!sub || sub.includes('.')) return null; return slugError(sub) ? null : sub;
}
