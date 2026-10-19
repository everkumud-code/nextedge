import { useEffect, useState } from 'react';
import { api } from '../api';
const empty = { batchId: '', subject: '', chapter: '', title: '', kind: 'link', url: '', body: '' };
export default function Study() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [form, setForm] = useState(empty); const [msg, setMsg] = useState(''); const [file, setFile] = useState<File | null>(null);
  const load = () => api('/content').then(setRows); useEffect(() => { load(); api('/batches').then(setBatches); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? 'Whole centre';
  async function publish() {
    setMsg('');
    try {
      let fileKey: string | undefined;
      if (form.kind === 'file') {
        if (!file) { setMsg('Choose a file'); return; }
        const u = await api('/content/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }) });
        if (u.error) { setMsg(u.error); return; }
        setMsg('Uploading…'); const put = await fetch(u.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } }); if (!put.ok) { setMsg('Upload failed'); return; } fileKey = u.key;
      }
      await api('/content', { method: 'POST', body: JSON.stringify({ ...form, batchId: form.batchId || undefined, fileKey, url: form.url || undefined, body: form.body || undefined }) });
      setForm(empty); setFile(null); setMsg('Published — students notified'); load();
    } catch (e: any) { setMsg(e.message); }
  }
  async function open(r: any) { if (r.fileKey) { const f = await api(`/content/${r.id}/file`); if (f.url) window.open(f.url, '_blank'); } else if (r.url) window.open(r.url, '_blank'); }
  const grouped: Record<string, any[]> = {}; rows.forEach((r) => { (grouped[r.subject] ||= []).push(r); });
  return (
    <div>
      <h1 className="text-2xl font-bold">Study material</h1>
      <div className="card p-4 mt-6 grid grid-cols-4 gap-3">
        <div><label className="text-sm font-medium">Batch</label><select className="input" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}><option value="">Whole centre</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-sm font-medium">Subject</label><input className="input" placeholder="Physics" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Chapter</label><input className="input" placeholder="Ch 3 · Laws of Motion" value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Title</label><input className="input" placeholder="Class notes" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Type</label><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="link">Link (Drive/YouTube)</option><option value="file">Upload file (PDF/image)</option><option value="video">Video link</option><option value="text">Typed notes</option></select></div>
        {form.kind === 'file' ? <div className="col-span-3"><label className="text-sm font-medium">File</label><input type="file" className="text-sm mt-2" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
          : form.kind === 'text' ? <div className="col-span-3"><label className="text-sm font-medium">Notes</label><textarea className="input" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
          : <div className="col-span-3"><label className="text-sm font-medium">URL</label><input className="input" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>}
        <div className="col-span-4 flex items-center gap-4"><button className="btn" disabled={!form.subject || !form.title} onClick={publish}>Publish</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      {Object.entries(grouped).map(([sub, list]) => <div key={sub} className="card p-4 mt-4"><h2 className="font-semibold mb-2">{sub}</h2>
        {list.map((r) => <div key={r.id} className="flex items-center justify-between py-2 border-t border-slate-100 text-sm"><div><b>{r.title}</b> <span className="text-slate-500">{r.chapter} · {bn(r.batchId)} · {new Date(r.createdAt).toLocaleDateString('en-IN')}</span>{r.body && <div className="text-slate-700 whitespace-pre-wrap mt-1">{r.body}</div>}</div>
          <div className="flex gap-2">{(r.url || r.fileKey) && <button className="btn-quiet" onClick={() => open(r)}>Open</button>}<button className="btn-quiet" onClick={async () => { await api(`/content/${r.id}`, { method: 'DELETE' }); load(); }}>Delete</button></div></div>)}</div>)}
      {!rows.length && <p className="text-slate-500 text-sm mt-6">Nothing published yet.</p>}
    </div>
  );
}
