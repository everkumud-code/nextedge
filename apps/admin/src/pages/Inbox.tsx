import { useEffect, useState } from 'react';
import { api } from '../api';
/** Doubts, leave requests and parent feedback in one place. */
export default function Inbox() {
  const [tab, setTab] = useState<'doubts' | 'leaves' | 'feedback'>('doubts'); const [doubts, setDoubts] = useState<any[]>([]); const [leaves, setLeaves] = useState<any[]>([]); const [fb, setFb] = useState<any[]>([]); const [msg, setMsg] = useState('');
  const load = () => { api('/doubts').then(setDoubts).catch(() => {}); api('/leaves').then(setLeaves).catch(() => {}); api('/feedback').then(setFb).catch(() => {}); }; useEffect(load, []);
  const pending = { doubts: doubts.filter((d) => !d.answer).length, leaves: leaves.filter((l) => l.status === 'pending').length, feedback: fb.filter((f) => f.status === 'open').length };
  async function answer(id: string, text: string) { if (!text.trim()) return; await api(`/doubts/${id}/answer`, { method: 'POST', body: JSON.stringify({ answer: text }) }); load(); }
  async function decide(id: string, status: string) { const note = status === 'rejected' ? prompt('Reason (optional)') || undefined : undefined; await api(`/leaves/${id}/decide`, { method: 'POST', body: JSON.stringify({ status, note }) }); load(); }
  async function reply(id: string, text: string) { if (!text.trim()) return; await api(`/feedback/${id}/reply`, { method: 'POST', body: JSON.stringify({ reply: text }) }); load(); }
  return (
    <div>
      <h1 className="text-2xl font-bold">Inbox</h1>
      <div className="flex gap-2 mt-4">{(['doubts', 'leaves', 'feedback'] as const).map((t) => <button key={t} className={tab === t ? 'btn' : 'btn-quiet'} onClick={() => setTab(t)}>{t === 'doubts' ? 'Doubts' : t === 'leaves' ? 'Leave requests' : 'Feedback'}{pending[t] ? ` (${pending[t]})` : ''}</button>)}</div>
      {msg && <p className="text-sm mt-2">{msg}</p>}
      <div className="mt-4 space-y-3">
        {tab === 'doubts' && (doubts.length ? doubts.map((d) => <div key={d.id} className={`card p-4 ${d.overdue ? 'border-brick' : ''}`}><div className="text-sm text-slate-600">{d.studentName} · {d.subject} · {new Date(d.createdAt).toLocaleString('en-IN')}{d.overdue && <span className="text-brick font-semibold"> · unanswered 24h+</span>}{d.resolved && <span className="text-moss"> · resolved</span>}</div><p className="mt-1 whitespace-pre-wrap">{d.question}</p>{d.imageUrl && <a className="text-xs underline" href={d.imageUrl} target="_blank" rel="noreferrer">photo</a>}
          {d.answer ? <p className="mt-2 text-sm bg-teal-100 rounded p-2 whitespace-pre-wrap"><b>Answer:</b> {d.answer}</p> : <div className="flex gap-2 mt-2"><input className="input" placeholder="Type the answer and press Enter" onKeyDown={(e) => e.key === 'Enter' && answer(d.id, (e.target as HTMLInputElement).value)} /></div>}</div>) : <p className="text-slate-500 text-sm">No doubts yet.</p>)}
        {tab === 'leaves' && (leaves.length ? leaves.map((l) => <div key={l.id} className="card p-4 flex items-center justify-between gap-3"><div><b>{l.studentName}</b> <span className="text-sm text-slate-600">{l.rollNo}</span><div className="text-sm">{l.fromDate} → {l.toDate} · {l.reason}</div>{l.note && <div className="text-xs text-slate-500">Note: {l.note}</div>}</div>
          {l.status === 'pending' ? <div className="flex gap-2"><button className="btn sm" onClick={() => decide(l.id, 'approved')}>Approve</button><button className="btn-quiet" onClick={() => decide(l.id, 'rejected')}>Reject</button></div> : <span className={`text-sm font-semibold ${l.status === 'approved' ? 'text-moss' : 'text-brick'}`}>{l.status}</span>}</div>) : <p className="text-slate-500 text-sm">No leave requests.</p>)}
        {tab === 'feedback' && (fb.length ? fb.map((f) => <div key={f.id} className={`card p-4 ${f.kind === 'complaint' ? 'border-brick' : ''}`}><div className="text-sm text-slate-600"><span className="tag">{f.kind}</span> {f.by} ({f.role.toLowerCase()}){f.studentName ? ` · about ${f.studentName}` : ''} · {new Date(f.createdAt).toLocaleString('en-IN')}</div><p className="mt-1 whitespace-pre-wrap">{f.text}</p>
          {f.reply ? <p className="mt-2 text-sm bg-teal-100 rounded p-2"><b>Your reply:</b> {f.reply}</p> : <input className="input mt-2" placeholder="Reply and press Enter" onKeyDown={(e) => e.key === 'Enter' && reply(f.id, (e.target as HTMLInputElement).value)} />}</div>) : <p className="text-slate-500 text-sm">No feedback yet.</p>)}
      </div>
    </div>
  );
}
