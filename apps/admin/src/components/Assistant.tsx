import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session } from '../api';

type Turn = { role: 'user' | 'assistant'; text: string; source?: string; links?: { title: string; link: string }[]; tools?: string[] };
const SUGGEST = ['How do I add a student?', 'Who has not paid fees?', "Today's attendance", 'What needs my attention today?', 'How do I print report cards?'];

/** "Ask NextEdge": a small help chat in the corner. Answers from help articles, and from the school's own data when the AI key is on. */
export default function Assistant() {
  const [open, setOpen] = useState(false); const [turns, setTurns] = useState<Turn[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [ai, setAi] = useState<boolean | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && ai === null) api('/assistant/status').then((s) => setAi(!!s.ai)).catch(() => setAi(false)); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);
  async function ask(text: string) {
    const question = text.trim(); if (!question || busy) return; setQ(''); const history = turns.slice(-8).map((t) => ({ role: t.role, content: t.text })); setTurns((t) => [...t, { role: 'user', text: question }]); setBusy(true);
    try { const r = await api('/assistant/ask', { method: 'POST', body: JSON.stringify({ question, history }) }); setTurns((t) => [...t, { role: 'assistant', text: r.answer, source: r.source, links: r.links, tools: r.tools }]); }
    catch (e: any) { setTurns((t) => [...t, { role: 'assistant', text: e.message || 'Something went wrong. Please try again.', source: 'error' }]); } finally { setBusy(false); }
  }
  if (!session.token || !['ADMIN', 'SUPER_ADMIN', 'STAFF', 'FACULTY'].includes(session.user?.role || '')) return null;
  return (
    <div className="fixed bottom-3 right-3 sm:bottom-5 sm:right-5 z-40 print:hidden" data-testid="assistant">
      {open && <div className="w-[calc(100vw-1.5rem)] sm:w-[380px] h-[70vh] sm:h-[520px] max-h-[520px] mb-3 bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
        <div className="bg-teal-900 text-white px-4 py-3 flex justify-between items-center"><div><div className="font-semibold">Ask NextEdge</div><div className="text-[11px] text-teal-200">{ai ? 'Answers from help and your own school data' : 'Answers from the help articles'}</div></div><button aria-label="Close" className="text-teal-200 hover:text-white text-lg" onClick={() => setOpen(false)}>✕</button></div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
          {turns.length === 0 && <div><p className="text-slate-600 mb-2">Ask how to do something, or {ai ? 'about your school’s numbers' : 'try one of these'}:</p><div className="flex flex-wrap gap-2">{SUGGEST.filter((s) => ai || !/paid|attendance|attention/i.test(s) || /report|add/i.test(s)).map((s) => <button key={s} className="btn-quiet !py-1 text-xs" onClick={() => ask(s)}>{s}</button>)}</div></div>}
          {turns.map((t, i) => <div key={i} className={t.role === 'user' ? 'text-right' : ''}><div className={`inline-block max-w-[92%] text-left rounded-lg px-3 py-2 whitespace-pre-line ${t.role === 'user' ? 'bg-edge-500 text-white' : t.source === 'error' ? 'bg-red-50 text-brick' : 'bg-slate-100'}`}>{t.text}</div>
            {t.links && t.links.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{t.links.map((l) => <Link key={l.link} to={l.link} onClick={() => setOpen(false)} className="text-xs underline text-edge-600">Open {l.title} →</Link>)}</div>}
            {t.source === 'ai' && t.tools && t.tools.length > 0 && <div className="text-[10px] text-slate-400 mt-0.5">checked: {[...new Set(t.tools)].join(', ').replace(/_/g, ' ')}</div>}</div>)}
          {busy && <div className="text-slate-400 text-xs">Thinking…</div>}<div ref={end} />
        </div>
        <form className="p-2 border-t flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}><input className="input" placeholder="Type your question" value={q} onChange={(e) => setQ(e.target.value)} disabled={busy} /><button className="btn" disabled={busy || q.trim().length < 2}>Ask</button></form>
      </div>}
      <button className="btn rounded-full shadow-lg ml-auto block" onClick={() => setOpen(!open)} aria-label="Ask NextEdge">{open ? 'Close help' : '💬 Ask NextEdge'}</button>
    </div>
  );
}
