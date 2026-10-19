import { useEffect, useState } from 'react';
import { api } from '../api';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export default function Timetable() {
  const [slots, setSlots] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [faculty, setFaculty] = useState<any[]>([]);
  const [f, setF] = useState({ batchId: '', weekday: 1, startTime: '07:00', endTime: '08:00', subject: '', facultyId: '', room: '' }); const [nf, setNf] = useState({ name: '', mobile: '' }); const [err, setErr] = useState('');
  const load = () => { api('/timetable').then(setSlots); api('/timetable/faculty').then(setFaculty); }; useEffect(() => { load(); api('/batches').then((b) => { setBatches(b); if (b[0]) setF((x) => ({ ...x, batchId: b[0].id })); }); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '—'; const fn = (id: string) => faculty.find((x) => x.id === id)?.name ?? '—';
  async function add() { setErr(''); try { await api('/timetable', { method: 'POST', body: JSON.stringify({ ...f, facultyId: f.facultyId || undefined, room: f.room || undefined }) }); load(); } catch (e: any) { setErr(e.message); } }
  async function addFaculty() { setErr(''); try { await api('/timetable/faculty', { method: 'POST', body: JSON.stringify(nf) }); setNf({ name: '', mobile: '' }); load(); } catch (e: any) { setErr(e.message); } }
  return (
    <div>
      <h1 className="text-2xl font-bold">Faculty & timetable</h1>
      <div className="card p-4 mt-6"><h2 className="font-semibold mb-2">Faculty</h2>
        <div className="flex gap-3 items-end"><div><label className="text-sm font-medium">Name</label><input className="input" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></div><div><label className="text-sm font-medium">Mobile (login)</label><input className="input" maxLength={10} value={nf.mobile} onChange={(e) => setNf({ ...nf, mobile: e.target.value.replace(/\D/g, '') })} /></div><button className="btn" disabled={!nf.name || nf.mobile.length !== 10} onClick={addFaculty}>Add faculty</button></div>
        <div className="mt-3 text-sm">{faculty.map((x) => <span key={x.id} className="inline-block mr-2 mb-1 px-2 py-1 rounded bg-teal-100">{x.name}</span>)}{!faculty.length && <span className="text-slate-500">No faculty yet.</span>}</div></div>
      <div className="card p-4 mt-4 grid grid-cols-7 gap-3 items-end">
        <div><label className="text-sm font-medium">Batch</label><select className="input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="text-sm font-medium">Day</label><select className="input" value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></div>
        <div><label className="text-sm font-medium">Start</label><input className="input" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></div>
        <div><label className="text-sm font-medium">End</label><input className="input" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Subject</label><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Faculty</label><select className="input" value={f.facultyId} onChange={(e) => setF({ ...f, facultyId: e.target.value })}><option value="">—</option>{faculty.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <button className="btn" disabled={!f.batchId || !f.subject} onClick={add}>Add slot</button>
        {err && <p className="col-span-7 text-brick text-sm">{err}</p>}
      </div>
      <div className="grid grid-cols-7 gap-3 mt-6">{DAYS.map((d, i) => <div key={d} className="card p-3 min-h-[120px]"><div className="font-semibold text-sm mb-2">{d}</div>
        {slots.filter((s) => s.weekday === i).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((s) => <div key={s.id} className="text-xs bg-marigold-100 rounded p-2 mb-2"><b>{s.startTime}–{s.endTime}</b><div>{s.subject}</div><div className="text-slate-600">{bn(s.batchId)}</div><div className="text-slate-600">{fn(s.facultyId)}</div><button className="underline mt-1" onClick={async () => { await api(`/timetable/${s.id}`, { method: 'DELETE' }); load(); }}>remove</button></div>)}</div>)}</div>
    </div>
  );
}
