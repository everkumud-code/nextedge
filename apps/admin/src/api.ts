const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';
export type User = { id: string; name: string; role: string; centreId: string | null; modules?: string[]; features?: string[]; subscriptionStatus?: string; institutionType?: string; centreName?: string };
export const session = {
  get token() { return localStorage.getItem('token'); },
  get user(): User | null { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; },
  set(token: string, user: User) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.clear(); },
  /** Super admin only: act inside one centre. Every API call then carries ?centreId=… and the screens use that centre's type and name. */
  get viewCentre(): string | null { return localStorage.getItem('viewCentre'); },
  viewing(c: { id: string; name: string; institutionType?: string } | null) {
    const u = session.user; if (!u) return;
    if (c) { localStorage.setItem('viewCentre', c.id); localStorage.setItem('user', JSON.stringify({ ...u, centreId: c.id, centreName: c.name, institutionType: c.institutionType || 'coaching' })); }
    else { localStorage.removeItem('viewCentre'); localStorage.setItem('user', JSON.stringify({ ...u, centreId: null, centreName: undefined, institutionType: undefined })); }
  },
};
export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const vc = session.user?.role === 'SUPER_ADMIN' ? session.viewCentre : null; if (vc && !/[?&]centreId=/.test(path)) path += (path.includes('?') ? '&' : '?') + 'centreId=' + vc;
  const res = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(opts.headers || {}) } });
  if (res.status === 401) { session.clear(); location.href = '/login'; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Request failed');
  return data;
}
