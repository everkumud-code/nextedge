import { useState } from 'react';
import { api } from '../api';

type Kind = 'late' | 'breakdown' | 'route_changed' | 'arrived' | 'other';
const KINDS: { kind: Kind; label: string; tone: string }[] = [
  { kind: 'late', label: 'Bus is running late', tone: 'bg-amber-500' },
  { kind: 'breakdown', label: 'Bus has broken down', tone: 'bg-red-600' },
  { kind: 'route_changed', label: 'Route changed today', tone: 'bg-sky-600' },
  { kind: 'arrived', label: 'Reached the school', tone: 'bg-emerald-600' },
  { kind: 'other', label: 'Other message', tone: 'bg-slate-600' },
];

/** One tap to tell every parent on a route: late, broken down, route changed, arrived. They get a push message and see it on their bus card. */
export default function BusAlert({ routes }: { routes: { id: string; title: string }[] }) {
  const [routeId, setRouteId] = useState(routes[0]?.id || ''); const [kind, setKind] = useState<Kind>('late'); const [minutes, setMinutes] = useState('15'); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  if (!routes.length) return null;
  const route = routes.find((r) => r.id === routeId) || routes[0];

  async function send() {
    const what = KINDS.find((k) => k.kind === kind)!.label.toLowerCase();
    if (!confirm(`Tell all parents on ${route.title}: ${what}?`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api('/transport/alert', { method: 'POST', body: JSON.stringify({ routeId: route.id, kind, minutes: kind === 'late' ? Number(minutes) || undefined : undefined, note: note.trim() || undefined }) });
      setMsg(r.parents ? `Sent to ${r.parents} parent${r.parents === 1 ? '' : 's'} of ${r.students} student${r.students === 1 ? '' : 's'}.` : `Saved, but no parent of this route has a login yet (${r.students} student${r.students === 1 ? '' : 's'} on the route). Make parent login codes first.`); setNote('');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return <div className="card p-4" data-testid="bus-alert">
    <h2 className="font-semibold">Tell the parents</h2>
    <p className="text-sm text-slate-600 mb-3">One tap sends a message to every parent on the route. They see it on their phone and on their bus card for 12 hours.</p>
    {routes.length > 1 && <select className="input mb-3" value={route.id} onChange={(e) => setRouteId(e.target.value)}>{routes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>}
    <div className="flex flex-wrap gap-2">{KINDS.map((k) => <button key={k.kind} type="button" onClick={() => setKind(k.kind)} className={`px-3 py-2 rounded-md text-sm font-medium border ${kind === k.kind ? `${k.tone} text-white border-transparent` : 'bg-white border-slate-300'}`}>{k.label}</button>)}</div>
    {kind === 'late' && <div className="mt-3 flex items-center gap-2 text-sm"><label>About how many minutes late?</label><input className="input w-24" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, '').slice(0, 3))} /></div>}
    <input className="input mt-3" placeholder={kind === 'other' ? 'Write the message for the parents' : 'Add a note (optional), e.g. heavy traffic at the bridge'} maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} />
    <button className="btn mt-3" disabled={busy || (kind === 'other' && !note.trim())} onClick={send}>{busy ? 'Sending…' : 'Send to parents'}</button>
    {msg && <p className="text-sm text-emerald-700 mt-2">{msg}</p>}{err && <p className="text-sm text-brick mt-2">{err}</p>}
  </div>;
}
