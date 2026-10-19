import { useEffect, useState } from 'react';
import { api } from '../api';
const empty = { name: '', className: '', rollNo: '', parentName: '', parentMobile: '', batchId: '' };
export default function Students() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [form, setForm] = useState(empty); const [err, setErr] = useState(''); const [q, setQ] = useState('');
  const load = () => api('/students').then(setRows); useEffect(() => { load(); api('/batches').then(setBatches); }, []);
  async function add() { setErr(''); try { await api('/students', { method: 'POST', body: JSON.stringify({ ...form, batchId: form.batchId || undefined }) }); setForm(empty); load(); } catch (e: any) { setErr(e.message); } }
  const batchName = (id: string) => batches.find((b) => b.id === id)?.name ?? '—';
  const shown = rows.filter((s) => s.active && (s.name + s.parentMobile + (s.rollNo || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Students</h1><input className="input w-64" placeholder="Search name, roll no, mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card p-4 mt-6 grid grid-cols-6 gap-3 items-end">
        <F label="Student name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
        <F label="Class"><input className="input" placeholder="12" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></F>
        <F label="Roll no"><input className="input" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} /></F>
        <F label="Parent name"><input className="input" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></F>
        <F label="Parent mobile"><input className="input" maxLength={10} value={form.parentMobile} onChange={(e) => setForm({ ...form, parentMobile: e.target.value.replace(/\D/g, '') })} /></F>
        <F label="Batch"><select className="input" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}><option value="">Not assigned</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
        <div className="col-span-6"><button className="btn" disabled={!form.name || form.parentMobile.length !== 10} onClick={add}>Add student</button>{err && <span className="text-brick text-sm ml-4">{err}</span>}</div>
      </div>
      <table className="card w-full mt-6"><thead><tr><th className="th">Roll</th><th className="th">Name</th><th className="th">Class</th><th className="th">Batch</th><th className="th">Parent</th><th className="th">Parent mobile</th></tr></thead>
        <tbody>{shown.map((s) => <tr key={s.id}><td className="td">{s.rollNo || '—'}</td><td className="td font-medium">{s.name}</td><td className="td">{s.className || '—'}</td><td className="td">{batchName(s.batchId)}</td><td className="td">{s.parentName || '—'}</td><td className="td">{s.parentMobile}</td></tr>)}
          {shown.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No students match.</td></tr>}</tbody></table>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="text-sm font-medium">{label}</label>{children}</div>; }
