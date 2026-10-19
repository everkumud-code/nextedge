import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Notices() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]);
  const [form, setForm] = useState({ title: '', body: '', type: 'GENERAL', batchId: '' }); const [err, setErr] = useState('');
  const [reads, setReads] = useState<{ id: string; read: any[]; unread: any[] } | null>(null);
  async function seenBy(id: string) { if (reads?.id === id) { setReads(null); return; } const r = await api(`/notices/${id}/reads`); setReads({ id, ...r }); }
  const load = () => api('/notices').then(setRows); useEffect(() => { load(); api('/batches').then(setBatches); }, []);
  async function publish() { setErr(''); try { await api('/notices', { method: 'POST', body: JSON.stringify({ ...form, batchId: form.batchId || undefined }) }); setForm({ title: '', body: '', type: 'GENERAL', batchId: '' }); load(); } catch (e: any) { setErr(e.message); } }
  return (
    <div>
      <h1 className="text-2xl font-bold">Notices</h1>
      <div className="card p-4 mt-6 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-sm font-medium">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Type</label><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{['GENERAL', 'HOLIDAY', 'EXAM', 'FEE', 'EVENT', 'URGENT'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label className="text-sm font-medium">Send to</label><select className="input" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}><option value="">Whole centre</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        </div>
        <div><label className="text-sm font-medium">Message</label><textarea className="input" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
        <div className="flex items-center gap-4"><button className="btn" disabled={!form.title || !form.body} onClick={publish}>Publish notice</button>{err && <span className="text-brick text-sm">{err}</span>}</div>
      </div>
      <div className="mt-6 space-y-3">{rows.map((n) => (
        <div key={n.id} className={`card p-4 ${n.type === 'URGENT' ? 'border-brick' : ''}`}>
          <div className="flex items-center gap-3"><span className="text-xs font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-900">{n.type}</span><span className="font-semibold">{n.title}</span><span className="ml-auto text-xs text-slate-500">{new Date(n.publishedAt).toLocaleString('en-IN')}</span></div>
          <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{n.body}</p>
          <button className="text-xs underline text-slate-600 mt-2" onClick={() => seenBy(n.id)}>{reads?.id === n.id ? 'Hide' : 'Seen by'}</button>
          {reads && reads.id === n.id && <div className="grid grid-cols-2 gap-4 mt-2 text-xs"><div><div className="font-semibold text-moss">Read ({reads.read.length})</div>{reads.read.map((p) => <div key={p.id}>{p.name} <span className="text-slate-500">{p.role.toLowerCase()}</span></div>)}</div><div><div className="font-semibold text-brick">Not yet ({reads.unread.length})</div>{reads.unread.map((p) => <div key={p.id}>{p.name} <span className="text-slate-500">{p.role.toLowerCase()}</span></div>)}</div></div>}
        </div>))}
        {!rows.length && <p className="text-slate-500 text-sm">No notices published yet.</p>}</div>
    </div>
  );
}
