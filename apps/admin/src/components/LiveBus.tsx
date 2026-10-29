import { useEffect, useState } from 'react';
import { api } from '../api';

/** Live bus panel on the Transport page: where each bus was last seen, and how a GPS tracker or the driver's phone sends its position. */
export default function LiveBus() {
  const [rows, setRows] = useState<any[]>([]); const [tk, setTk] = useState<any>(null); const [open, setOpen] = useState(false); const [copied, setCopied] = useState('');
  const load = () => { api('/transport/live').then(setRows).catch(() => {}); api('/transport/tracker').then(setTk).catch(() => {}); }; useEffect(() => { load(); const t = setInterval(() => api('/transport/live').then(setRows).catch(() => {}), 30000); return () => clearInterval(t); }, []);
  async function newKey() { if (tk?.key && !confirm('Create a new key? Trackers using the old key stop sending until you update them.')) return; await api('/transport/tracker/key', { method: 'POST' }); load(); }
  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1500); };
  const age = (m: number) => (m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`);
  return (
    <div className="card p-4 mb-4" data-testid="live-bus">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Live bus</h2><button className="btn-quiet" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Connect a GPS tracker'}</button></div>
      <table className="w-full text-sm mt-2"><thead><tr><th className="th">Route</th><th className="th">Vehicle</th><th className="th">Driver</th><th className="th">Last seen</th><th className="th">Speed</th><th className="th"></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.routeId}><td className="td font-medium">{r.route}</td><td className="td">{r.vehicle || '—'}</td><td className="td">{r.driver || '—'}{r.driverMobile && <> · <a className="underline" href={`tel:${r.driverMobile}`}>{r.driverMobile}</a></>}</td><td className="td">{r.position ? <span className={r.position.ageMin > 10 ? 'text-brick' : 'text-moss'}>{age(r.position.ageMin)}</span> : <span className="text-slate-400">no position yet</span>}</td><td className="td">{r.position?.speed != null ? `${r.position.speed} km/h` : '—'}</td><td className="td">{r.position && <a className="btn-quiet" href={r.position.maps} target="_blank" rel="noreferrer">Open map ↗</a>}</td></tr>)}{!rows.length && <tr><td className="td text-slate-500" colSpan={6}>Add a route first (below).</td></tr>}</tbody></table>
      {open && tk && <div className="mt-4 pt-3 border-t text-sm"><p className="text-slate-600">Any GPS tracker or tracking service that can call a web address works (Traccar, Wialon, a gateway, or a small app on the driver’s phone). Send the position to the address below with the key in the <span className="font-mono">x-api-key</span> header. The bus is matched by its <b>vehicle number</b> as written in the route.</p>
        <div className="grid grid-cols-[110px_1fr_auto] gap-2 items-center mt-3"><span className="text-slate-500">Address</span><span className="font-mono text-xs break-all bg-slate-50 p-2 rounded">POST {tk.endpoint}</span><button className="btn-quiet" onClick={() => copy('a', tk.endpoint)}>{copied === 'a' ? 'Copied' : 'Copy'}</button>
          <span className="text-slate-500">Key</span><span className="font-mono text-xs break-all bg-slate-50 p-2 rounded">{tk.key || 'No key yet'}</span>{tk.key ? <button className="btn-quiet" onClick={() => copy('k', tk.key)}>{copied === 'k' ? 'Copied' : 'Copy'}</button> : <span />}
          <span className="text-slate-500">Body</span><span className="font-mono text-xs bg-slate-50 p-2 rounded">{JSON.stringify(tk.sample)}</span><span /></div>
        <button className="btn mt-3" onClick={newKey}>{tk.key ? 'Create a new key' : 'Create key'}</button></div>}
    </div>
  );
}
