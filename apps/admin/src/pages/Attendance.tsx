import { useEffect, useState } from 'react';
import { api } from '../api';
type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
const today = new Date().toISOString().slice(0, 10);
export default function Attendance() {
  const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState(''); const [date, setDate] = useState(today);
  const [students, setStudents] = useState<any[]>([]); const [marks, setMarks] = useState<Record<string, Status>>({}); const [msg, setMsg] = useState('');
  const [summary, setSummary] = useState<any[]>([]); const [scan, setScan] = useState(''); const [scanMsg, setScanMsg] = useState('');
  async function doScan() { try { const r = await api('/attendance/scan', { method: 'POST', body: JSON.stringify({ studentId: scan.trim() }) }); setScanMsg(r.ok ? `${r.name} — ${r.already ? 'already marked ' + r.status : 'present, parent notified'}` : r.error); setScan(''); loadSummary(); } catch (e: any) { setScanMsg(e.message); } }
  const loadSummary = () => batchId && api(`/attendance/summary?batchId=${batchId}`).then(setSummary);
  useEffect(() => { api('/batches').then((b) => { setBatches(b); if (b[0]) setBatchId(b[0].id); }); }, []);
  useEffect(() => {
    if (!batchId) return;
    Promise.all([api(`/students?batchId=${batchId}`), api(`/attendance?batchId=${batchId}&date=${date}`)]).then(([st, att]) => {
      setStudents(st.filter((s: any) => s.active));
      const m: Record<string, Status> = {}; st.forEach((s: any) => (m[s.id] = 'PRESENT')); att.forEach((a: any) => (m[a.studentId] = a.status)); setMarks(m);
    });
    loadSummary();
  }, [batchId, date]);
  async function save() { await api('/attendance', { method: 'POST', body: JSON.stringify({ batchId, date, marks: students.map((s) => ({ studentId: s.id, status: marks[s.id] })) }) }); setMsg(`Saved for ${students.length} students`); setTimeout(() => setMsg(''), 2500); }
  const present = students.filter((s) => marks[s.id] === 'PRESENT' || marks[s.id] === 'LATE').length;
  return (
    <div>
      <h1 className="text-2xl font-bold">Attendance</h1>
      <div className="flex gap-3 mt-6 items-end">
        <div><label className="text-sm font-medium">Batch</label><select className="input w-72" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-sm font-medium">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="ml-auto text-sm text-slate-600 pb-2">{present} of {students.length} present</div>
        <button className="btn" disabled={!students.length} onClick={save}>Save attendance</button>
      </div>
      {msg && <p className="text-moss text-sm mt-2">{msg}</p>}
      <div className="card p-3 mt-4 flex items-center gap-3"><span className="text-sm font-medium">Gate scan</span><input className="input w-80" placeholder="Scan ID card QR (student id) and press Enter" value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doScan()} /><span className="text-sm">{scanMsg}</span></div>
      {summary.length > 0 && <div className="card p-3 mt-4 text-sm"><b>This month:</b> {summary.filter((s) => s.pct !== null).map((s) => <span key={s.id} className={`inline-block mr-3 ${s.low ? 'text-brick font-semibold' : ''}`}>{s.name} {s.pct}%</span>)}{summary.some((s) => s.low) && <span className="text-brick"> · red = below 75%</span>}</div>}
      <table className="card w-full mt-6"><thead><tr><th className="th">Roll</th><th className="th">Student</th><th className="th">Status</th></tr></thead>
        <tbody>{students.map((s) => <tr key={s.id}><td className="td">{s.rollNo || '—'}</td><td className="td font-medium">{s.name}</td><td className="td">
          <div className="flex gap-1">{(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as Status[]).map((st) => <button key={st} onClick={() => setMarks({ ...marks, [s.id]: st })} className={`px-3 py-1 rounded text-xs font-semibold ${marks[s.id] === st ? (st === 'ABSENT' ? 'bg-brick text-white' : st === 'PRESENT' ? 'bg-moss text-white' : 'bg-marigold-500') : 'bg-slate-100 hover:bg-slate-200'}`}>{st[0] + st.slice(1).toLowerCase()}</button>)}</div></td></tr>)}
        {!students.length && <tr><td className="td text-slate-500" colSpan={3}>No students in this batch yet.</td></tr>}</tbody></table>
    </div>
  );
}
