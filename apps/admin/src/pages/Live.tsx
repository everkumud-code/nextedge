import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Live() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [f, setF] = useState({ batchId: '', title: '', startAt: '', durationMin: 60, joinUrl: '', hybrid: false }); const [abs, setAbs] = useState<Record<string, any[]>>({}); const [msg, setMsg] = useState(''); const [rec, setRec] = useState<Record<string, string>>({});
  const load = () => api('/live').then(setRows); useEffect(() => { load(); api('/batches').then((b) => { setBatches(b); if (b[0]) setF((x) => ({ ...x, batchId: b[0].id })); }); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '';
  async function create() { setMsg(''); try { await api('/live', { method: 'POST', body: JSON.stringify({ ...f, startAt: new Date(f.startAt).toISOString(), joinUrl: f.joinUrl || undefined }) }); setF({ ...f, title: '', joinUrl: '' }); setMsg(f.hybrid ? 'Scheduled — the link goes to absent children when you start' : 'Scheduled — batch notified'); load(); } catch (e: any) { setMsg(e.message); } }
  const showAbsent = (id: string) => api(`/live/${id}/absent`).then((r) => setAbs((a) => ({ ...a, [id]: r }))).catch(() => {});
  useEffect(() => { const live = rows.filter((l) => l.status === 'live' && l.hybrid); live.forEach((l) => showAbsent(l.id)); if (!live.length) return; const t = setInterval(() => live.forEach((l) => showAbsent(l.id)), 15000); return () => clearInterval(t); }, [rows]);
  const act = async (id: string, path: string, body: any = {}) => { const r = await api(`/live/${id}/${path}`, { method: 'POST', body: JSON.stringify(body) }); if (path === 'end') setMsg(r.hybrid ? `Class ended · ${r.online} absent child${r.online === 1 ? '' : 'ren'} watched online (attendance not changed)` : `Class ended · ${r.present} present, ${r.absent} absent (auto-marked)`); if (path === 'start' && r.hybrid) setMsg(`Live · link sent to ${r.linksSent} of ${r.absent} absent children`); if (path === 'send-links') { setMsg(r.sent ? `Link sent to ${r.sent} more absent child${r.sent === 1 ? '' : 'ren'}` : 'Everyone who is absent already has the link'); showAbsent(id); } load(); };
  return (
    <div>
      <h1 className="text-2xl font-bold">Live classes</h1><p className="text-slate-600 text-sm">A free video room (Jitsi) is created for each class. Students who stay 60% of the duration are auto-marked present when you end the class. For a class held in the room, tick “Classroom class” so that only absent children get the link and the attendance you marked is not changed.</p>
      <div className="card p-4 mt-6 grid grid-cols-5 gap-3 items-end">
        <div><label className="text-sm font-medium">Batch</label><select className="input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-sm font-medium">Topic</label><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Start</label><input className="input" type="datetime-local" value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Minutes</label><input className="input" type="number" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></div>
        <div><label className="text-sm font-medium">Own link (optional)</label><input className="input" placeholder="Zoom / Meet" value={f.joinUrl} onChange={(e) => setF({ ...f, joinUrl: e.target.value })} /></div>
        <label className="col-span-5 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.hybrid} onChange={(e) => setF({ ...f, hybrid: e.target.checked })} /><span><b>Classroom class</b> — the lesson is held in the room and shown live to children who are absent. Only they (and their parents) get the join link; attendance stays as you mark it.</span></label>
        <div className="col-span-5 flex items-center gap-4"><button className="btn" disabled={!f.title || !f.startAt} onClick={create}>Schedule</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      {rows.map((l) => <div key={l.id} className="card p-4 mt-4 flex items-center justify-between flex-wrap gap-3">
        <div><b>{l.title}</b>{l.hybrid && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-edge-50 text-edge-700">Classroom + live for absent</span>} <span className="text-sm text-slate-600">{bn(l.batchId)} · {new Date(l.startAt).toLocaleString('en-IN')} · {l.durationMin} min</span><div className="text-xs mt-1"><span className={l.status === 'live' ? 'text-moss font-semibold' : l.status === 'cancelled' ? 'text-brick' : 'text-slate-500'}>{l.status}</span>{l.recordingUrl && <> · <a className="underline" href={l.recordingUrl} target="_blank" rel="noreferrer">recording</a></>}</div></div>
        <div className="flex gap-2 items-center">
          <a className="btn-quiet" href={l.joinUrl} target="_blank" rel="noreferrer">Open room</a>
          {l.status === 'scheduled' && <><button className="btn" onClick={() => act(l.id, 'start')}>{l.hybrid ? 'Start (send link to absent children)' : 'Start (notify students)'}</button><button className="btn-quiet" onClick={async () => { await api(`/live/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }); load(); }}>Cancel</button></>}
          {l.status === 'live' && l.hybrid && <button className="btn-quiet" onClick={() => act(l.id, 'send-links')}>Send link to absent children</button>}{l.status === 'live' && <><input className="input w-56 py-1" placeholder="Recording link (optional)" value={rec[l.id] || ''} onChange={(e) => setRec({ ...rec, [l.id]: e.target.value })} /><button className="btn" onClick={() => act(l.id, 'end', { recordingUrl: rec[l.id] || undefined })}>End class</button></>}
        </div>
        {l.status === 'live' && l.hybrid && <div className="basis-full text-sm"><b>Absent today:</b> {abs[l.id] ? (abs[l.id].length ? <ul className="mt-1 grid grid-cols-2 gap-x-6">{abs[l.id].map((k: any) => <li key={k.studentId}>{k.name} <span className="text-xs text-slate-500">{k.status === 'LEAVE' ? '(leave) ' : ''}· {k.watching ? <b className="text-moss">watching now</b> : k.joined ? `watched ${k.minutes} min` : k.linkSent ? 'link sent' : 'link not sent'}</span></li>)}</ul> : <span className="text-slate-500">nobody is absent</span>) : '…'}</div>}</div>)}
      {!rows.length && <p className="text-slate-500 text-sm mt-6">No live classes yet.</p>}
    </div>
  );
}
