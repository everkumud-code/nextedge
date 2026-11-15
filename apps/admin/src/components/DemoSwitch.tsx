import { useEffect, useState } from 'react';
import { api, session } from '../api';

/**
 * Demo only. In a demo school / coaching, the platform team and sales people can look at the product through each kind of login
 * (student, parent, teacher, bus driver, front office, HR, accounts ...) without OTP. Real centres never show this.
 * Three pieces share one loader: the "View as" dropdown (under the centre dropdown), the bar that always offers the way back, and the hook itself.
 */
export function useDemo() {
  const [d, setD] = useState<any>(null); const [busy, setBusy] = useState(false); const user = session.user;
  useEffect(() => { if (!user) return; api('/auth/demo-roles').then(setD).catch(() => setD({ available: false })); }, [user?.id, user?.centreId, session.viewCentre]);
  async function go(userId: string) {
    setBusy(true);
    try { const r = await api('/auth/demo-switch', { method: 'POST', body: JSON.stringify({ userId }) }); const was = session.user; localStorage.removeItem('viewCentre'); if (was?.role === 'SUPER_ADMIN') localStorage.setItem('demoReturn', JSON.stringify({ centreId: r.demoCentreId, name: was.centreName || '', type: was.institutionType || '' })); session.set(r.token, r.user); location.assign('/'); } catch { setBusy(false); }
  }
  async function back() {
    setBusy(true);
    try { const r = await api('/auth/demo-back', { method: 'POST' }); session.set(r.token, r.user); let ret: any = null; try { ret = JSON.parse(localStorage.getItem('demoReturn') || 'null'); } catch { /* none */ } localStorage.removeItem('demoReturn'); if (r.user.role === 'SUPER_ADMIN' && ret?.centreId) session.viewing({ id: ret.centreId, name: ret.name, institutionType: ret.type }); location.assign('/'); } catch { setBusy(false); }
  }
  // the stored login says it too, so the way back shows at once, before the list has loaded
  const switched = !!(user?.demoFrom || d?.switched);
  const current = d?.roles?.find((r: any) => r.current);
  return { d, busy, go, back, switched, available: !!d?.available, current };
}
export type Demo = ReturnType<typeof useDemo>;

/** "View as": one dropdown right under the centre dropdown, instead of a row of buttons at the bottom of the menu. */
export function RoleView({ demo }: { demo: Demo }) {
  const { d, busy, go, current, switched, back } = demo;
  if (!d?.available) return null;
  return (
    <div data-no-i18n className="mt-3">
      <label htmlFor="ne-role-view" className="text-[10px] uppercase tracking-wider text-teal-100/60">View as</label>
      <select id="ne-role-view" data-testid="role-view" disabled={busy} value={current?.userId || ''} onChange={(e) => e.target.value && go(e.target.value)} className="w-full mt-1 rounded bg-teal-800 text-white text-sm px-2 py-1.5 border border-teal-700">
        {!current && <option value="">— my own login —</option>}
        {d.roles.map((r: any) => <option key={r.kind} value={r.userId} title={`${r.name}${r.title ? ' · ' + r.title : ''}`}>{r.label}</option>)}
      </select>
      {switched && <button type="button" data-testid="role-view-back" className="mt-2 text-xs underline text-teal-100" disabled={busy} onClick={back}>← Back to my own login</button>}
    </div>
  );
}

/** Stays at the top of the page, scrolling with you, for as long as you are looking through someone else's demo login. */
export function BackToOwnLogin({ demo }: { demo: Demo }) {
  const { switched, current, back, busy } = demo;
  if (!switched) return null;
  return (
    <div data-no-i18n data-testid="demo-back-bar" role="status" className="sticky top-14 md:top-0 z-20 mb-4 -mt-2 p-2.5 rounded bg-marigold-100 border border-marigold-500 text-sm flex items-center gap-3 flex-wrap">
      <span><b>Demo view</b>{current ? <> as <b>{current.label}</b></> : null}. Changes here are only a demonstration.</span>
      <button type="button" className="btn-quiet ml-auto" disabled={busy} onClick={back}>← Back to my own login</button>
    </div>
  );
}
