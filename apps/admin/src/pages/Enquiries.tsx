import { useEffect, useState } from 'react';
import { api } from '../api';
const today = new Date().toISOString().slice(0, 10);
const STATUS = ['new', 'contacted', 'demo', 'admitted', 'lost'];
export default function Enquiries() {
  const [rows, setRows] = useState<any[]>([]); const [sum, setSum] = useState<any>(null); const [batches, setBatches] = useState<any[]>([]); const [filter, setFilter] = useState('');
  const [f, setF] = useState({ name: '', mobile: '', className: '', course: '', source: 'walk-in', notes: '', nextFollowUp: today }); const [msg, setMsg] = useState('');
  const load = () => { api(`/enquiries${filter ? `?status=${filter}` : ''}`).then(setRows); api('/enquiries/summary').then(setSum); }; useEffect(() => { load(); api('/batches').then(setBatches); }, [filter]);
  async function add() { setMsg(''); try { await api('/enquiries', { method: 'POST', body: JSON.stringify(f) }); setF({ ...f, name: '', mobile: '', notes: '' }); load(); } catch (e: any) { setMsg(e.message); } }
  async function upd(id: string, body: any) { await api(`/enquiries/${id}`, { method: 'PUT', body: JSON.stringify(body) }); load(); }
  async function admit(r: any) { const batchId = prompt(`Admit ${r.name}. Batch id (leave blank for none):\n${batches.map((b) => `${b.name} = ${b.id}`).join('\n')}`) || undefined; const st = await api(`/enquiries/${r.id}/admit`, { method: 'POST', body: JSON.stringify({ batchId }) }); setMsg(`${st.name} admitted — parent can log in with ${r.mobile}`); load(); }
  return (
    <div>
      <h1 className="text-2xl font-bold">Enquiries</h1>
      {sum && <div className="grid grid-cols-5 gap-3 mt-4">{['new', 'contacted', 'demo', 'admitted', 'lost'].map((s) => <button key={s} onClick={() => setFilter(filter === s ? '' : s)} className={`card p-3 text-left ${filter === s ? 'border-marigold-500' : ''}`}><div className="text-xs text-slate-600 capitalize">{s}</div><div className="text-xl font-bold">{sum.byStatus[s] || 0}</div></button>)}<div className="col-span-5 text-sm text-slate-600">Conversion {sum.conversion}% · sources: {Object.entries(sum.bySource).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}</div></div>}
      <div className="card p-4 mt-4 grid grid-cols-7 gap-2 items-end">
        <div><label className="text-xs font-medium">Student name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="text-xs font-medium">Mobile</label><input className="input" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, '') })} /></div>
        <div><label className="text-xs font-medium">Class</label><input className="input" value={f.className} onChange={(e) => setF({ ...f, className: e.target.value })} /></div>
        <div><label className="text-xs font-medium">Course</label><input className="input" value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} /></div>
        <div><label className="text-xs font-medium">Source</label><select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{['walk-in', 'phone', 'website', 'referral', 'social'].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="text-xs font-medium">Follow up on</label><input className="input" type="date" value={f.nextFollowUp} onChange={(e) => setF({ ...f, nextFollowUp: e.target.value })} /></div>
        <button className="btn" disabled={!f.name || f.mobile.length !== 10} onClick={add}>Add</button>
        <div className="col-span-7"><input className="input" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      </div>
      {msg && <p className="text-sm mt-2">{msg}</p>}
      <table className="card w-full mt-4"><thead><tr><th className="th">Name</th><th className="th">Mobile</th><th className="th">Class / course</th><th className="th">Source</th><th className="th">Status</th><th className="th">Follow up</th><th className="th">Notes</th><th className="th"></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className={r.followUpDue ? 'bg-marigold-100' : ''}><td className="td font-medium">{r.name}</td><td className="td">{r.mobile}</td><td className="td">{[r.className, r.course].filter(Boolean).join(' · ')}</td><td className="td">{r.source}</td>
          <td className="td"><select className="input py-1" value={r.status} onChange={(e) => upd(r.id, { status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
          <td className="td"><input className="input py-1" type="date" value={r.nextFollowUp || ''} onChange={(e) => upd(r.id, { nextFollowUp: e.target.value || null })} /></td>
          <td className="td"><input className="input py-1" defaultValue={r.notes || ''} onBlur={(e) => e.target.value !== (r.notes || '') && upd(r.id, { notes: e.target.value })} /></td>
          <td className="td">{r.status !== 'admitted' && <button className="btn sm" onClick={() => admit(r)}>Admit</button>}</td></tr>)}
          {!rows.length && <tr><td className="td text-slate-500" colSpan={8}>No enquiries{filter ? ` with status ${filter}` : ''}.</td></tr>}</tbody></table>
    </div>
  );
}
