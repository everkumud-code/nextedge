import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Batches() {
  const [rows, setRows] = useState<any[]>([]); const [form, setForm] = useState({ name: '', course: '', capacity: 60 }); const [err, setErr] = useState('');
  const load = () => api('/batches').then(setRows); useEffect(() => { load(); }, []);
  async function add() { setErr(''); try { await api('/batches', { method: 'POST', body: JSON.stringify(form) }); setForm({ name: '', course: '', capacity: 60 }); load(); } catch (e: any) { setErr(e.message); } }
  return (
    <div>
      <h1 className="text-2xl font-bold">Batches</h1>
      <div className="card p-4 mt-6 flex gap-3 items-end">
        <div className="flex-1"><label className="text-sm font-medium">Batch name</label><input className="input" placeholder="Class 12 PCM - Morning" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="flex-1"><label className="text-sm font-medium">Course</label><input className="input" placeholder="JEE Foundation" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} /></div>
        <div className="w-28"><label className="text-sm font-medium">Capacity</label><input className="input" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
        <button className="btn" disabled={!form.name || !form.course} onClick={add}>Add batch</button>
      </div>
      {err && <p className="text-brick text-sm mt-2">{err}</p>}
      <table className="card w-full mt-6"><thead><tr><th className="th">Batch</th><th className="th">Course</th><th className="th">Capacity</th></tr></thead>
        <tbody>{rows.map((b) => <tr key={b.id}><td className="td font-medium">{b.name}</td><td className="td">{b.course}</td><td className="td">{b.capacity}</td></tr>)}</tbody></table>
    </div>
  );
}
