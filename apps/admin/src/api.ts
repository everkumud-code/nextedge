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

export const fileUrl = (id: string) => `${BASE}/files/${id}`;
/** Opens a PDF/file from the API in a new tab (sends the login, and the chosen centre when a super admin is in support mode). */
export async function openPdf(path: string, err = 'Could not open the file') {
  const vc = session.user?.role === 'SUPER_ADMIN' ? session.viewCentre : null; if (vc && !/[?&]centreId=/.test(path)) path += (path.includes('?') ? '&' : '?') + 'centreId=' + vc;
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${session.token}` } }); if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.message || err); return; }
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}
/** Reads a picked file as base64 and stores it (photos are shrunk by the server). */
export async function uploadFile(file: File, ownerKind: string, ownerId?: string): Promise<{ id: string; url: string; name: string }> {
  const data: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('Could not read the file')); fr.readAsDataURL(file); });
  return api('/files', { method: 'POST', body: JSON.stringify({ ownerKind, ownerId, name: file.name, mime: file.type || 'application/octet-stream', data }) });
}

/** Download a file from the API (with the login token) and save it under the given name. */
export async function downloadFile(path: string, filename: string, err = 'Could not download the file'): Promise<boolean> {
  const vc = session.user?.role === 'SUPER_ADMIN' ? session.viewCentre : null; if (vc && !/[?&]centreId=/.test(path)) path += (path.includes('?') ? '&' : '?') + 'centreId=' + vc;
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${session.token}` } }); if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.message || err); return false; }
  const cd = r.headers.get('Content-Disposition') || ''; const name = /filename="([^"]+)"/.exec(cd)?.[1] || filename; const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return true;
}
