import { useEffect, useRef, useState } from 'react';
import { api, session, downloadFile, canDownload } from '../api';
type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
const today = new Date().toISOString().slice(0, 10); const thisMonth = today.slice(0, 7);
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';
const code: Record<string, string> = { PRESENT: 'P', ABSENT: 'A', LATE: 'L', LEAVE: 'Lv' };
const colour: Record<string, string> = { PRESENT: 'bg-moss/20 text-moss', ABSENT: 'bg-brick/15 text-brick', LATE: 'bg-marigold-100 text-marigold-600', LEAVE: 'bg-slate-100 text-slate-600' };

/** Attendance: today's roll call, which batches are still unmarked, gate scan, monthly register with CSV, below-75% list with parent alerts, per-student history. */
export default function Attendance() {
  const [tab, setTab] = useState<'today' | 'register' | 'low' | 'scan'>('today');
  const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState(''); const [date, setDate] = useState(today); const [month, setMonth] = useState(thisMonth);
  const [students, setStudents] = useState<any[]>([]); const [marks, setMarks] = useState<Record<string, Status>>({}); const [saved, setSaved] = useState<Record<string, Status>>({}); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [daily, setDaily] = useState<any[]>([]); const [reg, setReg] = useState<any>(null); const [low, setLow] = useState<any[]>([]); const [hist, setHist] = useState<{ name: string; rows: any[] } | null>(null);
  const [scan, setScan] = useState(''); const [scans, setScans] = useState<any[]>([]); const scanRef = useRef<HTMLInputElement>(null);
  const owner = ['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role || '');

  useEffect(() => { api('/batches').then((b) => { setBatches(b); if (b[0]) setBatchId(b[0].id); }); }, []);
  const loadDaily = () => api(`/attendance/daily?date=${date}`).then(setDaily).catch(() => {});
  useEffect(() => { loadDaily(); }, [date]);
  useEffect(() => {
    if (!batchId) return;
    Promise.all([api(`/students?batchId=${batchId}`), api(`/attendance?batchId=${batchId}&date=${date}`)]).then(([st, att]) => {
      const list = st.filter((s: any) => s.active !== false); setStudents(list);
      const m: Record<string, Status> = {}; list.forEach((s: any) => (m[s.id] = 'PRESENT')); const sv: Record<string, Status> = {}; att.forEach((a: any) => { m[a.studentId] = a.status; sv[a.studentId] = a.status; }); setMarks(m); setSaved(sv);
    });
  }, [batchId, date]);
  useEffect(() => { if (tab === 'register' && batchId) api(`/attendance/register?batchId=${batchId}&month=${month}`).then(setReg); if (tab === 'low') api('/attendance/summary').then((r) => setLow(r.filter((x: any) => x.low))); if (tab === 'scan') setTimeout(() => scanRef.current?.focus(), 50); }, [tab, batchId, month]);

  async function save() { setBusy(true); try { await api('/attendance', { method: 'POST', body: JSON.stringify({ batchId, date, marks: students.map((s) => ({ studentId: s.id, status: marks[s.id] })) }) }); const sv: Record<string, Status> = {}; students.forEach((s) => (sv[s.id] = marks[s.id])); setSaved(sv); setMsg(`Saved ${students.length} students at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Parents of absentees have been notified.`); loadDaily(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } }
  function setAll(st: Status) { const m: Record<string, Status> = {}; students.forEach((s) => (m[s.id] = st)); setMarks(m); }
  async function doScan() { const v = scan.trim(); if (!v) return; try { const r = await api('/attendance/scan', { method: 'POST', body: JSON.stringify({ studentId: v }) }); setScans((x) => [{ at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), ok: r.ok, text: r.ok ? `${r.name}${r.rollNo ? ' (' + r.rollNo + ')' : ''} — ${r.already ? 'already ' + r.status.toLowerCase() : 'present, parent notified'}` : r.error }, ...x].slice(0, 30)); } catch (e: any) { setScans((x) => [{ at: '', ok: false, text: e.message }, ...x]); } setScan(''); scanRef.current?.focus(); }
  async function history(s: any) { const rows = await api(`/attendance/history?studentId=${s.id}`); setHist({ name: s.name, rows }); }
  async function notifyLow() { const r = await api('/attendance/notify-low', { method: 'POST' }); setMsg(`Alerted ${r.sent} parent(s) of ${r.low} students below 75%.`); }

  const counts = { present: students.filter((s) => marks[s.id] === 'PRESENT').length, absent: students.filter((s) => marks[s.id] === 'ABSENT').length, late: students.filter((s) => marks[s.id] === 'LATE').length, leave: students.filter((s) => marks[s.id] === 'LEAVE').length };
  const unsaved = students.some((s) => saved[s.id] !== marks[s.id]); const everSaved = Object.keys(saved).length > 0;
  const batchName = batches.find((b) => b.id === batchId)?.name || '';

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><h1 className="text-2xl font-bold">Attendance</h1>
        <div className="flex gap-2">{(['today', 'scan', 'register', 'low'] as const).map((t) => <button key={t} className={tab === t ? 'btn' : 'btn-quiet'} onClick={() => setTab(t)}>{t === 'today' ? 'Roll call' : t === 'scan' ? 'Gate scan' : t === 'register' ? 'Monthly register' : 'Below 75%'}</button>)}</div></div>

      {tab === 'today' && <>
        <div className="card p-3 mt-4 flex flex-wrap gap-2 items-center text-sm"><span className="font-medium mr-2">{date === today ? 'Today' : date}:</span>{daily.map((d) => <button key={d.id} onClick={() => setBatchId(d.id)} className={`px-3 py-1 rounded-full border ${d.id === batchId ? 'border-edge-500 bg-edge-100' : 'border-slate-200'} ${d.marked === 0 ? 'text-brick' : ''}`}>{d.name}: {d.marked === 0 ? 'not marked' : `${d.present}/${d.students} present${d.absent ? `, ${d.absent} absent` : ''}`}</button>)}</div>
        <div className="flex gap-3 mt-4 items-end flex-wrap">
          <div><label className="text-sm font-medium">Batch</label><select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><label className="text-sm font-medium">Date</label><input className="input" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="flex gap-2"><button className="btn-quiet" onClick={() => setAll('PRESENT')}>All present</button><button className="btn-quiet" onClick={() => setAll('ABSENT')}>All absent</button></div>
          <div className="ml-auto text-sm text-slate-600">{counts.present} present · {counts.absent} absent · {counts.late} late · {counts.leave} leave</div>
          <button className="btn" disabled={!students.length || busy} onClick={save}>{busy ? 'Saving…' : everSaved ? (unsaved ? 'Save changes' : 'Saved ✓') : 'Save attendance'}</button>
        </div>
        {msg && <p className="text-sm mt-2 text-moss">{msg}</p>}
        <div className="card mt-4 overflow-hidden"><table className="w-full"><thead><tr><th className="th w-16">Roll</th><th className="th">Student</th><th className="th">Status</th><th className="th w-24">Month %</th></tr></thead>
          <tbody>{students.map((s) => <tr key={s.id} className={marks[s.id] === 'ABSENT' ? 'bg-brick/5' : ''}>
            <td className="td text-slate-500">{s.rollNo}</td>
            <td className="td font-medium"><button className="hover:underline text-left" onClick={() => history(s)}>{s.name}</button><div className="text-xs text-slate-500">{s.parentName ? `${s.parentName} · ` : ''}{s.parentMobile}</div></td>
            <td className="td"><div className="flex gap-1">{(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as Status[]).map((st) => <button key={st} onClick={() => setMarks({ ...marks, [s.id]: st })} className={`px-3 py-1 rounded-md text-sm font-medium border ${marks[s.id] === st ? colour[st] + ' border-transparent' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{st === 'PRESENT' ? 'Present' : st === 'ABSENT' ? 'Absent' : st === 'LATE' ? 'Late' : 'Leave'}</button>)}</div></td>
            <td className="td"><Pct id={s.id} /></td>
          </tr>)}</tbody></table>{!students.length && <p className="p-4 text-sm text-slate-500">No active students in {batchName || 'this batch'}.</p>}</div>
        <p className="text-xs text-slate-500 mt-2">Tip: students scanned at the gate are already Present here. Marking Absent sends the parent an alert at once; Leave does not count against attendance %.</p>
      </>}

      {tab === 'scan' && <div className="card p-6 mt-4 max-w-xl">
        <h2 className="font-semibold">Gate scan</h2><p className="text-sm text-slate-600 mt-1">Point a USB/Bluetooth QR scanner here and scan the student’s ID card, or type the roll number and press Enter. Parent gets “reached the centre” instantly.</p>
        <input ref={scanRef} className="input mt-3 text-lg" placeholder="Scan QR / type roll no and press Enter" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doScan()} autoFocus />
        <ul className="mt-4 text-sm space-y-1">{scans.map((x, i) => <li key={i} className={x.ok ? 'text-moss' : 'text-brick'}>{x.at && <span className="text-slate-400 mr-2">{x.at}</span>}{x.text}</li>)}</ul>
        <p className="text-xs text-slate-500 mt-4">Print QR ID cards from the <a className="underline" href="/id-cards">ID cards</a> page. The teacher app can also scan with the phone camera.</p>
      </div>}

      {tab === 'register' && <>
        <div className="flex gap-3 mt-4 items-end flex-wrap">
          <div><label className="text-sm font-medium">Batch</label><select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><label className="text-sm font-medium">Month</label><input className="input" type="month" max={thisMonth} value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          {canDownload() && <a className="btn-quiet" href={`${API}/attendance/register.csv?batchId=${batchId}&month=${month}`} onClick={async (e) => { e.preventDefault(); await downloadFile(`/attendance/register.csv?batchId=${batchId}&month=${month}`, `attendance-${batchName}-${month}.csv`); }}>Download Excel (CSV)</a>}
          <button className="btn-quiet" onClick={() => window.print()}>Print</button>
        </div>
        {reg && <div className="card mt-4 overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="th sticky left-0 bg-white">Roll</th><th className="th sticky left-12 bg-white">Student</th>{reg.days.map((d: string) => <th key={d} className="th text-center px-1">{d.slice(8)}</th>)}<th className="th text-center">P</th><th className="th text-center">T</th><th className="th text-center">%</th></tr></thead>
          <tbody>{reg.students.map((s: any) => <tr key={s.id}><td className="td sticky left-0 bg-white">{s.rollNo}</td><td className="td sticky left-12 bg-white font-medium whitespace-nowrap">{s.name}</td>{reg.days.map((d: string) => <td key={d} className={`td text-center px-1 ${colour[s.days[d]] || ''}`}>{code[s.days[d]] || '·'}</td>)}<td className="td text-center">{s.present}</td><td className="td text-center">{s.total}</td><td className={`td text-center font-semibold ${s.pct !== null && s.pct < 75 ? 'text-brick' : ''}`}>{s.pct ?? '—'}</td></tr>)}</tbody></table>
          {!reg.days.length && <p className="p-4 text-sm text-slate-500">No attendance marked in {month} for this batch.</p>}
          <p className="p-3 text-xs text-slate-500">P = present · A = absent · L = late (counts as present) · Lv = approved leave (not counted) · T = working days marked</p></div>}
      </>}

      {tab === 'low' && <div className="mt-4">
        <div className="flex items-center justify-between flex-wrap gap-3"><p className="text-sm text-slate-600">Students below 75% this month, across all batches.</p>{owner && <button className="btn" disabled={!low.length} onClick={notifyLow}>Alert all parents</button>}</div>
        {msg && <p className="text-sm mt-2 text-moss">{msg}</p>}
        <table className="card w-full mt-3"><thead><tr><th className="th">Roll</th><th className="th">Student</th><th className="th">Batch</th><th className="th">Present / days</th><th className="th">%</th><th className="th">Parent</th></tr></thead>
          <tbody>{low.map((s) => <tr key={s.id}><td className="td">{s.rollNo}</td><td className="td font-medium"><button className="hover:underline" onClick={() => history(s)}>{s.name}</button></td><td className="td">{batches.find((b) => b.id === s.batchId)?.name}</td><td className="td">{s.present} / {s.total}</td><td className="td font-semibold text-brick">{s.pct}%</td><td className="td">{s.parentMobile && <a className="underline" href={`tel:${s.parentMobile}`}>{s.parentMobile}</a>}</td></tr>)}</tbody></table>
        {!low.length && <p className="text-sm text-slate-500 mt-3">Everyone is at or above 75%. 🎉</p>}
      </div>}

      {hist && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setHist(null)}><div className="card p-5 w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center"><h2 className="font-semibold">{hist.name} — attendance history</h2><button className="btn-quiet" onClick={() => setHist(null)}>Close</button></div>
        <ul className="mt-3 text-sm divide-y divide-slate-100">{hist.rows.map((r) => <li key={r.date} className="py-1 flex justify-between"><span>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className={`px-2 rounded ${colour[r.status]}`}>{r.status.toLowerCase()}</span></li>)}</ul>{!hist.rows.length && <p className="text-sm text-slate-500 mt-2">No attendance yet.</p>}
      </div></div>}
    </div>
  );
}
/** Month % badge for a student, loaded lazily from the summary endpoint (one call per batch load, cached in module scope). */
let summaryCache: { at: number; rows: any[] } | null = null;
function Pct({ id }: { id: string }) {
  const [v, setV] = useState<any>(undefined);
  useEffect(() => { const go = async () => { if (!summaryCache || Date.now() - summaryCache.at > 15000) summaryCache = { at: Date.now(), rows: await api('/attendance/summary') }; setV(summaryCache.rows.find((r) => r.id === id)); }; go(); }, [id]);
  if (!v || v.pct === null) return <span className="text-slate-400">—</span>;
  return <span className={`font-semibold ${v.low ? 'text-brick' : 'text-moss'}`}>{v.pct}%</span>;
}
