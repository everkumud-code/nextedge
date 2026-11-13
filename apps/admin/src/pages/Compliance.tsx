import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const TONE: Record<string, { box: string; chip: string; label: string }> = {
  ok: { box: 'border-moss/40', chip: 'bg-moss/15 text-moss', label: 'Fine' },
  info: { box: 'border-slate-300', chip: 'bg-slate-100 text-slate-600', label: 'Note' },
  warn: { box: 'border-marigold-500', chip: 'bg-marigold-500/20 text-amber-800', label: 'Check' },
  fail: { box: 'border-brick', chip: 'bg-brick/15 text-brick', label: 'Fix' },
};

/** Board compliance: advisory checks against CBSE norms (section size, teacher ratio, 75% attendance, LOC data, APAAR/PEN). Never blocks anything. */
export default function Compliance() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [open, setOpen] = useState<string>('');
  useEffect(() => { api('/insights/compliance').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-brick">{err}</p>; if (!d) return <p className="text-slate-500">Loading…</p>;
  const boardName = d.board === 'CBSE' ? 'CBSE' : d.board === 'CISCE' ? 'CISCE (ICSE / ISC)' : d.board === 'STATE' ? 'State board' : 'Board not set';
  return (
    <div>
      <h1 className="text-2xl font-bold">Board compliance</h1>
      <p className="text-sm text-slate-600">Checks your school records against the board’s published norms. It only <b>warns</b> — nothing is blocked. Board: <b>{boardName}</b>{d.board === 'OTHER' && <> — choose it in <Link className="underline text-edge-600" to="/school-profile">School profile</Link> so the right checks apply</>}.</p>
      <div className="grid grid-cols-3 gap-3 mt-4 max-w-xl">
        <div className="card p-3 text-center"><div className="text-2xl font-bold text-brick">{d.counts.fail}</div><div className="text-xs text-slate-500">to fix</div></div>
        <div className="card p-3 text-center"><div className="text-2xl font-bold text-amber-700">{d.counts.warn}</div><div className="text-xs text-slate-500">to check</div></div>
        <div className="card p-3 text-center"><div className="text-2xl font-bold text-moss">{d.counts.ok}</div><div className="text-xs text-slate-500">fine</div></div>
      </div>
      <div className="mt-4 space-y-3">
        {d.checks.map((c: any) => { const t = TONE[c.status] || TONE.info; return (
          <div key={c.key} className={`card p-4 border-l-4 ${t.box}`}>
            <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{c.title}</div><p className="text-sm text-slate-700 mt-1">{c.detail}</p><p className="text-xs text-slate-500 mt-1">Source: {c.source}</p></div><span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${t.chip}`}>{t.label}</span></div>
            {c.items.length > 0 && <div className="mt-2"><button className="btn-quiet" onClick={() => setOpen(open === c.key ? '' : c.key)}>{open === c.key ? 'Hide list' : `Show list (${c.total})`}</button>{open === c.key && <ul className="mt-2 text-sm list-disc pl-5 space-y-0.5">{c.items.map((x: string, i: number) => <li key={i}>{x}</li>)}{c.total > c.items.length && <li className="text-slate-500">…and {c.total - c.items.length} more</li>}</ul>}</div>}
          </div>); })}
      </div>
      <p className="text-xs text-slate-500 mt-5 max-w-2xl">This page is a helper, not legal advice. Norms change — always follow the board’s latest circular. Attendance is counted from 1 April {String(d.since).slice(0, 4)}, and approved leave counts as absent. APAAR ID is created with the parent’s consent; if the family says no, write “refused” in the student’s APAAR box and it stops showing here.</p>
    </div>
  );
}
