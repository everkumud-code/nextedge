import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

const ROLE: Record<string, string> = { SUPER_ADMIN: 'NextEdge', ADMIN: 'Owner', FACULTY: 'Teacher', STAFF: 'Staff', STUDENT: 'Student', PARENT: 'Parent', EXPERT: 'Counsellor' };
const AREAS = ['Students', 'Classes', 'Attendance', 'Fees', 'Exams', 'Notices', 'Homework', 'Study material', 'Timetable', 'Library', 'Staff', 'Records', 'Files', 'Houses', 'Payroll', 'Admissions', 'Enquiries', 'Certificates', 'Messaging', 'Subscription', 'Recycle bin'];
const when = (v: any) => new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const tone = (a: any) => /^(Deleted|Erased|Not allowed|Sign-in failed)/.test(a.action) ? 'text-brick' : /^(Restored|Brought back)/.test(a.action) ? 'text-edge-700' : '';
const csvCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** The activity log as a table: who, what, when. `scope="platform"` is the platform's own work; `scope="client"` needs a centre (the owner's own centre is chosen by the server). */
export default function ActivityList({ scope, centre }: { scope: 'platform' | 'client'; centre?: string }) {
  const [rows, setRows] = useState<any[] | null>(null); const [more, setMore] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [q, setQ] = useState(''); const [person, setPerson] = useState(''); const [area, setArea] = useState(''); const [only, setOnly] = useState(false); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const seq = useRef(0);
  const qs = (offset: number) => { const p = new URLSearchParams({ scope, limit: '50', offset: String(offset) }); if (centre) p.set('centre', centre); if (q.trim()) p.set('q', q.trim()); if (person.trim()) p.set('person', person.trim()); if (area) p.set('area', area); if (only) p.set('only', 'delete'); if (from) p.set('from', from); if (to) p.set('to', to); return p.toString(); };
  const load = (append = false) => {
    const my = ++seq.current; setBusy(true); setErr('');
    api(`/activity?${qs(append ? rows?.length || 0 : 0)}`).then((r) => { if (my !== seq.current) return; setRows(append ? [...(rows || []), ...r.items] : r.items); setMore(r.more); }).catch((e) => { if (my === seq.current) { setErr(e.message); setRows([]); } }).finally(() => { if (my === seq.current) setBusy(false); });
  };
  useEffect(() => { const t = setTimeout(() => load(false), 250); return () => clearTimeout(t); }, [scope, centre, q, person, area, only, from, to]);
  function exportCsv() {
    const head = ['When', 'Who', 'Role', 'Client', 'What', 'About', 'Via', 'IP']; const lines = [head.map(csvCell).join(',')];
    for (const a of rows || []) lines.push([when(a.at), a.userName, ROLE[a.role] || a.role, a.centreName, a.action, a.detail, a.via, a.ip].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })); const l = document.createElement('a'); l.href = url; l.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`; l.click(); URL.revokeObjectURL(url);
  }
  return (
    <div data-testid="activity-list">
      <div className="flex gap-2 flex-wrap items-end mt-3">
        <input className="input !w-56" placeholder="Search (name, what, about)" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input !w-40" placeholder="Person" aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} />
        <select className="input !w-44" aria-label="Area" value={area} onChange={(e) => setArea(e.target.value)}><option value="">All areas</option>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
        <label className="text-xs text-slate-600">From<input type="date" className="input !w-40 block" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-xs text-slate-600">To<input type="date" className="input !w-40 block" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="text-sm flex items-center gap-1.5 pb-2"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Only deletes and refused deletes</label>
        <button type="button" className="btn-quiet ml-auto" onClick={exportCsv} disabled={!rows?.length}>Download CSV</button>
      </div>
      {err && <div className="mt-3 p-2.5 rounded bg-red-50 text-brick text-sm" role="alert">{err}</div>}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="td border-t-0">When</th><th className="td border-t-0">Who</th>{scope === 'platform' && <th className="td border-t-0">Client</th>}<th className="td border-t-0">What</th><th className="td border-t-0">About</th></tr></thead>
          <tbody>{(rows || []).map((a) => (
            <tr key={a.id} data-testid="activity-row">
              <td className="td whitespace-nowrap text-slate-500">{when(a.at)}</td>
              <td className="td"><div className="font-medium">{a.userName || '—'}</div><div className="text-xs text-slate-500">{ROLE[a.role] || a.role || ''}{a.via === 'support' ? ' · support mode' : a.via === 'demo' ? ' · demo' : ''}</div></td>
              {scope === 'platform' && <td className="td">{a.centreName || '—'}</td>}
              <td className={`td ${tone(a)}`}>{a.action}</td>
              <td className="td text-slate-700 break-words max-w-xs">{a.detail}</td>
            </tr>))}</tbody></table>
        {rows === null || (busy && !rows.length) ? <p className="p-4 text-sm text-slate-500">Loading…</p> : !rows.length && !err ? <p className="p-4 text-sm text-slate-500">Nothing recorded for this view yet.</p> : null}
      </div>
      {more && <div className="mt-3 text-center"><button type="button" className="btn-quiet" disabled={busy} onClick={() => load(true)}>Show older</button></div>}
    </div>
  );
}
