const BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';
export type User = { id: string; name: string; role: string; centreId: string | null; modules?: string[]; features?: string[]; subscriptionStatus?: string };
export const session = {
  get token() { return localStorage.getItem('token'); },
  get user(): User | null { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; },
  set(token: string, user: User) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  clear() { localStorage.clear(); },
};
export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(session.token ? { Authorization: `Bearer ${session.token}` } : {}), ...(opts.headers || {}) } });
  if (res.status === 401) { session.clear(); location.href = '/login'; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Request failed');
  return data;
}
