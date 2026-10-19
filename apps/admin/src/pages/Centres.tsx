import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Centres() {
  const [rows, setRows] = useState<any[]>([]); const [f, setF] = useState({ name: '', city: '', plan: 'starter', adminName: '', adminMobile: '', adminEmail: '' }); const [msg, setMsg] = useState('');
  const load = () => api('/centres').then(setRows); useEffect(() => { load(); }, []);
  async function add() { setMsg(''); try { const r = await api('/centres', { method: 'POST', body: JSON.stringify(f) }); setMsg(`Created. ${r.admin.name} can log in with ${r.admin.email} (coaching: ${r.centre.name}).`); setF({ name: '', city: '', plan: 'starter', adminName: '', adminMobile: '', adminEmail: '' }); load(); } catch (e: any) { setMsg(e.message); } }
  return (
    <div>
      <h1 className="text-2xl font-bold">Centres</h1><p className="text-slate-600">Super-admin: every coaching centre on the platform.</p>
      <div className="card p-4 mt-6 grid grid-cols-5 gap-3 items-end">
        <div><label className="text-sm font-medium">Centre name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="text-sm font-medium">City</label><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Plan</label><select className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}><option value="starter">Starter ₹25</option><option value="standard">Standard ₹40</option><option value="pro">Pro ₹60</option></select></div>
        <div><label className="text-sm font-medium">Admin name</label><input className="input" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Admin mobile</label><input className="input" maxLength={10} value={f.adminMobile} onChange={(e) => setF({ ...f, adminMobile: e.target.value.replace(/\D/g, '') })} /></div>
        <div><label className="text-sm font-medium">Owner email (login)</label><input className="input" type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></div>
        <div className="col-span-5 flex items-center gap-4"><button className="btn" disabled={!f.name || !f.adminName || f.adminMobile.length !== 10 || !f.adminEmail.includes('@')} onClick={add}>Create centre</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      <table className="card w-full mt-6"><thead><tr><th className="th">Centre</th><th className="th">City</th><th className="th">Plan</th><th className="th">Active students</th><th className="th">Since</th></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id}><td className="td font-medium">{c.name}</td><td className="td">{c.city || '—'}</td><td className="td">{c.plan}</td><td className="td">{c.students}</td><td className="td">{new Date(c.createdAt).toLocaleDateString('en-IN')}</td></tr>)}</tbody></table>
    </div>
  );
}
