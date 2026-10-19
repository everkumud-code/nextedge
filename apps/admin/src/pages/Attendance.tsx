import { useEffect, useState } from 'react';
import { api } from '../api';
type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
const today = new Date().toISOString().slice(0, 10);
export default function Attendance() {
  const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState(''); const [date, setDate] = useState(today);
  const [students, setStudents] = useState<any[]>([]); const [marks, setMarks] = useState<Record<string, Status>>({}); const [msg, setMsg] = useState('');
  useEffect(() => { api('/batches').then((b) => { setBatches(b); if (b[0]) setBatchId(b[0].id); }); }, []);
  useEffect(() => {
    if (!batchId) return;
    Promise.all([api(`/students?batchId=${batchId}`), api(`/attendance?batchId=${batchId}&date=${date}`)]).then(([st, att]) => {
      setStudents(st.filter((s: any) => s.active));
      const m: Record<string, Status> = {}; st.forEach((s: any) => (m[s.id] = 'PRESENT')); att.forEach((a: any) => (m[a.studentId] = a.status)); setMarks(m);
    });
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
      <table className="card w-full mt-6"><thead><tr><th className="th">Roll</th><th className="th">Student</th><th className="th">Status</th></tr></thead>
        <tbody>{students.map((s) => <tr key={s.id}><td className="td">{s.rollNo || '—'}</td><td className="td font-medium">{s.name}</td><td className="td">
          <div className="flex gap-1">{(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as Status[]).map((st) => <button key={st} onClick={() => setMarks({ ...marks, [s.id]: st })} className={`px-3 py-1 rounded text-xs font-semibold ${marks[s.id] === st ? (st === 'ABSENT' ? 'bg-brick text-white' : st === 'PRESENT' ? 'bg-moss text-white' : 'bg-marigold-500') : 'bg-slate-100 hover:bg-slate-200'}`}>{st[0] + st.slice(1).toLowerCase()}</button>)}</div></td></tr>)}
        {!students.length && <tr><td className="td text-slate-500" colSpan={3}>No students in this batch yet.</td></tr>}</tbody></table>
    </div>
  );
}
