import { useEffect, useState } from 'react';
import { api, session } from '../api';

/**
 * Demo only. In a demo school / coaching, the platform team and sales people can look at the product through each kind of login
 * (student, parent, teacher, bus driver, front office, HR, accounts ...) without OTP. Real centres never show this.
 */
export default function DemoSwitch() {
  const [d, setD] = useState<any>(null); const [busy, setBusy] = useState(false); const user = session.user;
  useEffect(() => { if (!user) return; api('/auth/demo-roles').then(setD).catch(() => setD({ available: false })); }, [user?.id, user?.centreId]);
  if (!d?.available) return null;
  async function go(userId: string) {
    setBusy(true);
    try { const r = await api('/auth/demo-switch', { method: 'POST', body: JSON.stringify({ userId }) }); const was = session.user; localStorage.removeItem('viewCentre'); if (was?.role === 'SUPER_ADMIN') localStorage.setItem('demoReturn', JSON.stringify({ centreId: r.demoCentreId, name: was.centreName || '', type: was.institutionType || '' })); session.set(r.token, r.user); location.assign('/'); } catch { setBusy(false); }
  }
  async function back() {
    setBusy(true);
    try { const r = await api('/auth/demo-back', { method: 'POST' }); session.set(r.token, r.user); let ret: any = null; try { ret = JSON.parse(localStorage.getItem('demoReturn') || 'null'); } catch { /* none */ } localStorage.removeItem('demoReturn'); if (r.user.role === 'SUPER_ADMIN' && ret?.centreId) session.viewing({ id: ret.centreId, name: ret.name, institutionType: ret.type }); location.assign('/'); } catch { setBusy(false); }
  }
  return (
    <div data-no-i18n className="px-5 py-3 border-t border-teal-800 text-teal-100">
      <div className="text-[10px] uppercase tracking-wider text-teal-100/60">Demo · view as</div>
      <div className="flex flex-wrap gap-1.5 mt-2">{d.roles.map((r: any) => <button key={r.kind} disabled={busy || r.current} title={`${r.name}${r.title ? ' · ' + r.title : ''}`} onClick={() => go(r.userId)} className={`px-2 py-1 rounded text-xs border ${r.current ? 'bg-white text-teal-900 font-semibold border-white' : 'border-teal-600 hover:bg-teal-800'}`}>{r.label}</button>)}</div>
      {d.switched && <button className="mt-2 text-xs underline" disabled={busy} onClick={back}>← Back to my own login</button>}
    </div>
  );
}
