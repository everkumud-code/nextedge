import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Homework() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [f, setF] = useState({ batchId: '', title: '', subject: '', description: '', dueAt: '' }); const [open, setOpen] = useState<string | null>(null); const [subs, setSubs] = useState<any[]>([]); const [msg, setMsg] = useState('');
  const load = () => api('/homework').then(setRows); useEffect(() => { load(); api('/batches').then((b) => { setBatches(b); if (b[0]) setF((x) => ({ ...x, batchId: b[0].id })); }); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '';
  async function create() { setMsg(''); try { await api('/homework', { method: 'POST', body: JSON.stringify({ ...f, dueAt: new Date(f.dueAt).toISOString() }) }); setF({ ...f, title: '', description: '' }); setMsg('Assigned — students notified'); load(); } catch (e: any) { setMsg(e.message); } }
  async function show(id: string) { if (open === id) { setOpen(null); return; } setSubs(await api(`/homework/${id}/submissions`)); setOpen(id); }
  async function grade(id: string, submissionId: string, g: string, remark: string) { await api(`/homework/${id}/grade`, { method: 'PUT', body: JSON.stringify({ submissionId, grade: g, remark }) }); setSubs(await api(`/homework/${id}/submissions`)); load(); }
  async function openFile(key: string) { const r = await api(`/homework/file?key=${encodeURIComponent(key)}`); if (r.url) window.open(r.url, '_blank'); }
  return (
    <div>
      <h1 className="text-2xl font-bold">Homework</h1>
      <div className="card p-4 mt-6 grid grid-cols-5 gap-3">
        <div><label className="text-sm font-medium">Batch</label><select className="input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="col-span-2"><label className="text-sm font-medium">Title</label><input className="input" placeholder="Exercise 3.2, Q1–10" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Subject</label><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Due</label><input className="input" type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></div>
        <div className="col-span-5"><textarea className="input" rows={2} placeholder="Instructions" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="col-span-5 flex items-center gap-4"><button className="btn" disabled={!f.title || !f.dueAt} onClick={create}>Assign</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      {rows.map((h) => <div key={h.id} className="card p-4 mt-4">
        <div className="flex items-center justify-between flex-wrap gap-2"><div><b>{h.title}</b> <span className="text-sm text-slate-600">{bn(h.batchId)} · due {new Date(h.dueAt).toLocaleString('en-IN')} · {h.submitted}/{h.total} submitted · {h.checked} checked</span>{h.description && <div className="text-sm text-slate-700 mt-1">{h.description}</div>}</div>
          <div className="flex gap-2"><button className="btn-quiet" onClick={() => show(h.id)}>{open === h.id ? 'Hide' : 'Check'}</button><button className="btn-quiet" onClick={async () => { const r = await api(`/homework/${h.id}/remind`, { method: 'POST' }); setMsg(`Reminded ${r.reminded} students`); }}>Remind pending</button></div></div>
        {open === h.id && <table className="w-full text-sm mt-3"><thead><tr><th className="th">Student</th><th className="th">Submission</th><th className="th">Grade</th><th className="th">Remark</th></tr></thead>
          <tbody>{subs.map((s) => <tr key={s.id}><td className="td">{s.name} <span className="text-slate-400">{s.rollNo}</span></td>
            <td className="td">{s.submission ? <div>{s.submission.text && <div className="whitespace-pre-wrap">{s.submission.text}</div>}{s.submission.fileKeys.map((k: string) => <button key={k} className="underline text-xs mr-2" onClick={() => openFile(k)}>open file</button>)}<div className="text-xs text-slate-500">{new Date(s.submission.submittedAt).toLocaleString('en-IN')}{s.submission.late && <span className="text-brick"> · late</span>}</div></div> : <span className="text-slate-400">Not submitted</span>}</td>
            <td className="td">{s.submission && <input className="input w-20 py-1" defaultValue={s.submission.grade || ''} placeholder="A / 8" onBlur={(e) => grade(h.id, s.submission.id, e.target.value, s.submission.remark || '')} />}</td>
            <td className="td">{s.submission && <input className="input py-1" defaultValue={s.submission.remark || ''} placeholder="Good work" onBlur={(e) => grade(h.id, s.submission.id, s.submission.grade || '', e.target.value)} />}</td></tr>)}</tbody></table>}
      </div>)}
      {!rows.length && <p className="text-slate-500 text-sm mt-6">No homework assigned yet.</p>}
    </div>
  );
}
