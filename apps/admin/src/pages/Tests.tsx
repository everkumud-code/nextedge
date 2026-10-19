import { useEffect, useState } from 'react';
import { api } from '../api';
type Q = { q: string; opts: string[]; ans: string; chapter?: string; marks?: number };
const today = new Date().toISOString().slice(0, 10);
export default function Tests() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [f, setF] = useState({ batchId: '', title: '', subject: '', mode: 'online', date: today, durationMin: 60, maxMarks: 100, negative: 0 });
  const [qText, setQText] = useState(''); const [open, setOpen] = useState<string | null>(null); const [results, setResults] = useState<any>(null); const [marks, setMarks] = useState<Record<string, string>>({}); const [msg, setMsg] = useState('');
  const load = () => api('/tests').then(setRows); useEffect(() => { load(); api('/batches').then((b) => { setBatches(b); if (b[0]) setF((x) => ({ ...x, batchId: b[0].id })); }); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '';
  const parseQ = (): Q[] => qText.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 6).map((p) => ({ q: p[0], opts: p.slice(1, 5), ans: p[5].toUpperCase(), chapter: p[6] || undefined, marks: p[7] ? Number(p[7]) : 1 }));
  async function create() { setMsg(''); try { await api('/tests', { method: 'POST', body: JSON.stringify({ ...f, questions: parseQ() }) }); setQText(''); setMsg('Test created (not yet published)'); load(); } catch (e: any) { setMsg(e.message); } }
  async function show(id: string) { if (open === id) { setOpen(null); return; } const r = await api(`/tests/${id}/results`); setResults(r); setOpen(id); setMarks(Object.fromEntries(r.rows.map((x: any) => [x.id, x.marks ?? '']))); }
  async function saveMarks(id: string) { await api(`/tests/${id}/marks`, { method: 'PUT', body: JSON.stringify({ marks: Object.entries(marks).filter(([, v]) => v !== '').map(([studentId, v]) => ({ studentId, marks: Number(v) })) }) }); setMsg('Marks saved'); show(id); setOpen(id); }
  async function pub(id: string, what: 'test' | 'results', value: boolean) { await api(`/tests/${id}/publish`, { method: 'POST', body: JSON.stringify({ what, value }) }); load(); if (open === id) { setOpen(null); show(id); } }
  return (
    <div>
      <h1 className="text-2xl font-bold">Tests</h1>
      <div className="card p-4 mt-6">
        <div className="grid grid-cols-6 gap-3">
          <div><label className="text-sm font-medium">Batch</label><select className="input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="col-span-2"><label className="text-sm font-medium">Title</label><input className="input" placeholder="Weekly test 4 · Physics" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Subject</label><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Type</label><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="online">Online MCQ</option><option value="offline">Offline paper</option></select></div>
          <div><label className="text-sm font-medium">Date</label><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
          {f.mode === 'online' ? <><div><label className="text-sm font-medium">Duration (min)</label><input className="input" type="number" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></div><div><label className="text-sm font-medium">Negative per wrong</label><input className="input" type="number" step="0.25" value={f.negative} onChange={(e) => setF({ ...f, negative: Number(e.target.value) })} /></div></>
            : <div><label className="text-sm font-medium">Max marks</label><input className="input" type="number" value={f.maxMarks} onChange={(e) => setF({ ...f, maxMarks: Number(e.target.value) })} /></div>}
        </div>
        {f.mode === 'online' && <div className="mt-3"><label className="text-sm font-medium">Questions — one per line: <code className="text-xs">Question | A | B | C | D | correct letter | chapter (optional) | marks (optional)</code></label><textarea className="input font-mono text-sm" rows={6} value={qText} onChange={(e) => setQText(e.target.value)} placeholder="SI unit of force? | Joule | Newton | Watt | Pascal | B | Laws of Motion | 1" /><div className="text-xs text-slate-500 mt-1">{parseQ().length} questions parsed</div></div>}
        <div className="flex items-center gap-4 mt-3"><button className="btn" disabled={!f.title || (f.mode === 'online' && !parseQ().length)} onClick={create}>Create test</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      {rows.map((t) => <div key={t.id} className="card p-4 mt-4">
        <div className="flex items-center justify-between flex-wrap gap-2"><div><b>{t.title}</b> <span className="text-sm text-slate-600">{bn(t.batchId)} · {t.date} · {t.mode === 'online' ? `${t.questions.length} MCQs` : 'offline'} · max {t.maxMarks}</span>
          <div className="text-xs mt-1">{t.published ? <span className="text-moss">Visible to students</span> : <span className="text-slate-500">Draft</span>} · {t.resultsPublished ? <span className="text-moss">Results published</span> : <span className="text-slate-500">Results hidden</span>}</div></div>
          <div className="flex gap-2"><button className="btn-quiet" onClick={() => show(t.id)}>{open === t.id ? 'Hide' : 'Marks & results'}</button><button className="btn-quiet" onClick={() => pub(t.id, 'test', !t.published)}>{t.published ? 'Unpublish test' : 'Publish test'}</button><button className={t.resultsPublished ? 'btn-quiet' : 'btn'} onClick={() => pub(t.id, 'results', !t.resultsPublished)}>{t.resultsPublished ? 'Hide results' : 'Publish results'}</button></div></div>
        {open === t.id && results && <div className="mt-3">
          <div className="text-sm text-slate-600 mb-2">Attempted {results.attempted} · Average {results.average}{results.topper ? ` · Topper ${results.topper.name} (${results.topper.marks})` : ''}</div>
          <table className="w-full text-sm"><thead><tr><th className="th">Rank</th><th className="th">Student</th><th className="th">Marks / {results.maxMarks}</th><th className="th">Percentile</th><th className="th">Weak chapters</th>{t.mode === 'online' && <th className="th">Tab switches</th>}</tr></thead>
            <tbody>{results.rows.map((r: any) => <tr key={r.id}><td className="td">{r.rank ?? '—'}</td><td className="td">{r.name} <span className="text-slate-400">{r.rollNo}</span></td><td className="td">{t.mode === 'offline' ? <input className="input w-24 py-1" value={marks[r.id] ?? ''} onChange={(e) => setMarks({ ...marks, [r.id]: e.target.value.replace(/[^\d.]/g, '') })} /> : r.marks ?? <span className="text-slate-400">not attempted</span>}</td><td className="td">{r.percentile ?? '—'}</td><td className="td text-brick text-xs">{r.weakChapters?.join(', ')}</td>{t.mode === 'online' && <td className="td">{r.tabSwitches || 0}</td>}</tr>)}</tbody></table>
          {t.mode === 'offline' && <button className="btn mt-3" onClick={() => saveMarks(t.id)}>Save marks</button>}
        </div>}
      </div>)}
      {!rows.length && <p className="text-slate-500 text-sm mt-6">No tests yet.</p>}
    </div>
  );
}
