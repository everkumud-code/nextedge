import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
const TONE: Record<string, string> = { high: 'border-brick', medium: 'border-marigold-500', info: 'border-slate-300' };
const LABEL: Record<string, string> = { high: 'Needs action', medium: 'Keep an eye', info: 'For information' };

/** Alert centre: everything that needs attention today, across fees, attendance, admissions, leave, stock and more. */
export default function Alerts() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  const load = () => api('/alerts').then(setD).catch((e) => setErr(e.message)); useEffect(() => { load(); const t = setInterval(load, 120000); return () => clearInterval(t); }, []);
  if (err) return <p className="text-brick">{err}</p>; if (!d) return <p className="text-slate-500">Loading…</p>;
  return (
    <div>
      <div className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">Alerts</h1><p className="text-sm text-slate-600">{d.alerts.length ? `${d.total} item(s) need attention across ${d.alerts.filter((a: any) => a.severity !== 'info').length} area(s) · ${new Date(d.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Nothing needs attention right now.'}</p></div><button className="btn-quiet" onClick={load}>Refresh</button></div>
      {!d.alerts.length && <div className="card p-8 mt-4 text-center text-slate-500">All clear. New alerts appear here as soon as something needs you.</div>}
      {['high', 'medium', 'info'].map((sev) => { const rows = d.alerts.filter((a: any) => a.severity === sev); if (!rows.length) return null; return <div key={sev} className="mt-5"><h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{LABEL[sev]}</h2><div className="grid grid-cols-2 gap-3">{rows.map((a: any) => <Link key={a.key} to={a.path} className={`card p-4 border-l-4 ${TONE[sev]} hover:shadow-md`}><div className="flex items-start justify-between gap-3"><div className="font-semibold">{a.label}</div><div className="text-2xl font-bold leading-none">{a.count}</div></div>{a.hint && <div className="text-sm text-slate-600 mt-1">{a.hint}</div>}{a.sample.length > 0 && <div className="text-xs text-slate-500 mt-2">{a.sample.join(' · ')}{a.count > a.sample.length ? ` …` : ''}</div>}<div className="text-xs text-edge-600 mt-2">Open →</div></Link>)}</div></div>; })}
    </div>
  );
}
