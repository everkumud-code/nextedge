import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Live() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [f, setF] = useState({ batchId: '', title: '', startAt: '', durationMin: 60, joinUrl: '' }); const [msg, setMsg] = useState(''); const [rec, setRec] = useState<Record<string, string>>({});
  const load = () => api('/live').then(setRows); useEffect(() => { load(); api('/batches').then((b) => { setBatches(b); if (b[0]) setF((x) => ({ ...x, batchId: b[0].id })); }); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '';
  async function create() { setMsg(''); try { await api('/live', { method: 'POST', body: JSON.stringify({ ...f, startAt: new Date(f.startAt).toISOString(), joinUrl: f.joinUrl || undefined }) }); setF({ ...f, title: '', joinUrl: '' }); setMsg('Scheduled — batch notified'); load(); } catch (e: any) { setMsg(e.message); } }
  const act = async (id: string, path: string, body: any = {}) => { const r = await api(`/live/${id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); if (path === 'end') setMsg(`Class ended · ${r.present} present, ${r.absent} absent (auto-marked)`); load(); };
  return (
    <div>
      <h1 className="text-2xl font-bold">Live classes</h1><p className="text-slate-600 text-sm">A free video room (Jitsi) is created for each class. Students who stay 60% of the duration are auto-marked present when you end the class.</p>
      <div className="card p-4 mt-6 grid grid-cols-5 gap-3 items-end">
        <div><label className="text-sm font-medium">Batch</label><select className="input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-sm font-medium">Topic</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Start</label><input className="input" type="datetime-local" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Minutes</label><input className="input" type="number" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></div>
        <div><label className="text-sm font-medium">Own link (optional)</label><input className="input" placeholder="Zoom / Meet" value={f.joinUrl} onChange={(e) => setF({ ...f, joinUrl: e.target.value })} /></div>
        <div className="col-span-5 flex items-center gap-4"><button className="btn" disabled={!f.title || !f.startAt} onClick={create}>Schedule</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      {rows.map((l) => <div key={l.id} className="card p-4 mt-4 flex items-center justify-between flex-wrap gap-3">
        <div><b>{l.title}</b> <span className="text-sm text-slate-600">{bn(l.batchId)} · {new Date(l.startAt).toLocaleString('en-IN')} · {l.durationMin} min</span><div className="text-xs mt-1"><span className={l.status === 'live' ? 'text-moss font-semibold' : l.status === 'cancelled' ? 'text-brick' : 'text-slate-500'}>{l.status}</span>{l.recordingUrl && <> · <a className="underline" href={l.recordingUrl} target="_blank" rel="noreferrer">recording</a></>}</div></div>
        <div className="flex gap-2 items-center">
          <a className="btn-quiet" href={l.joinUrl} target="_blank" rel="noreferrer">Open room</a>
          {l.status === 'scheduled' && <><button className="btn" onClick={() => act(l.id, 'start')}>Start (notify students)</button><button className="btn-quiet" onClick={async () => { await api(`/live/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); load(); }}>Cancel</button></>}
          {l.status === 'live' && <><input className="input w-56 py-1" placeholder="Recording link (optional)" value={rec[l.id] || ''} onChange={(e) => setRec({ ...rec, [l.id]: e.target.value })} /><button className="btn" onClick={() => act(l.id, 'end', { recordingUrl: rec[l.id] || undefined })}>End class</button></>}
        </div></div>)}
      {!rows.length && <p className="text-slate-500 text-sm mt-6">No live classes yet.</p>}
    </div>
  );
}
