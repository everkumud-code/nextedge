import { useEffect, useState } from 'react';
import { api } from '../api';
type Mod = { key: string; label: string };
export default function Staff() {
  const [rows, setRows] = useState<any[]>([]); const [mods, setMods] = useState<Mod[]>([]); const [f, setF] = useState({ name: '', mobile: '', email: '', role: 'FACULTY', title: '', modules: [] as string[] }); const [edit, setEdit] = useState<any | null>(null); const [msg, setMsg] = useState('');
  const load = () => api('/staff').then(setRows); useEffect(() => { load(); api('/staff/modules').then((m) => { setMods(m); }); }, []);
  const toggle = (list: string[], k: string) => list.includes(k) ? list.filter((x) => x !== k) : [...list, k];
  async function add() { setMsg(''); try { await api('/staff', { method: 'POST', body: JSON.stringify({ ...f, email: f.email || undefined, title: f.title || undefined }) }); setF({ name: '', mobile: '', email: '', role: 'FACULTY', title: '', modules: [] }); setMsg('Staff added — they can log in with their mobile now'); load(); } catch (e: any) { setMsg(e.message); } }
  async function save() { setMsg(''); try { await api(`/staff/${edit.id}`, { method: 'PUT', body: JSON.stringify({ name: edit.name, email: edit.email || undefined, role: edit.role, title: edit.title || undefined, modules: edit.modules, active: edit.active }) }); setEdit(null); setMsg('Saved'); load(); } catch (e: any) { setMsg(e.message); } }
  const Perms = ({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) => <div className="grid grid-cols-4 gap-1 text-sm">{mods.map((m) => <label key={m.key} className={`flex items-center gap-2 px-2 py-1 rounded ${disabled ? 'opacity-50' : 'hover:bg-slate-50'}`}><input type="checkbox" disabled={disabled} checked={value.includes(m.key)} onChange={() => onChange(toggle(value, m.key))} />{m.label}</label>)}</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold">Staff & privileges</h1><p className="text-slate-600 text-sm">Tick what each person may open. Owners (Admin role) always see everything.</p>
      <div className="card p-4 mt-6">
        <h2 className="font-semibold mb-2">Add staff</h2>
        <div className="grid grid-cols-5 gap-3">
          <div><label className="text-sm font-medium">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Mobile (login)</label><input className="input" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, '') })} /></div>
          <div><label className="text-sm font-medium">Email</label><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Role</label><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="FACULTY">Teacher</option><option value="STAFF">Staff (office / non-teaching)</option><option value="ADMIN">Co-owner (full access)</option></select></div>
          <div><label className="text-sm font-medium">Title</label><input className="input" placeholder="Physics faculty / Receptionist" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        </div>
        {f.role !== 'ADMIN' && <div className="mt-3"><div className="text-sm font-medium mb-1">Can open</div><Perms value={f.modules} onChange={(v) => setF({ ...f, modules: v })} /><div className="flex gap-2 mt-2 text-xs"><button className="underline" onClick={() => setF({ ...f, modules: ['attendance', 'study', 'live', 'tests', 'homework', 'notices', 'chat', 'doubts', 'leaves'] })}>Teacher preset</button><button className="underline" onClick={() => setF({ ...f, modules: ['students', 'attendance', 'fees', 'notices', 'enquiries', 'leaves', 'feedback'] })}>Front-desk preset</button><button className="underline" onClick={() => setF({ ...f, modules: ['fees', 'reports'] })}>Accountant preset</button></div></div>}
        <div className="flex items-center gap-4 mt-3"><button className="btn" disabled={!f.name || f.mobile.length !== 10} onClick={add}>Add staff</button>{msg && <span className="text-sm">{msg}</span>}</div>
      </div>
      <table className="card w-full mt-6"><thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Mobile</th><th className="th">Can open</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="td font-medium">{r.name}{r.title && <div className="text-xs text-slate-500">{r.title}</div>}</td><td className="td">{r.roleLabel}</td><td className="td">{r.mobile}</td><td className="td text-xs">{r.role === 'ADMIN' ? 'Everything' : r.modules.map((k: string) => mods.find((m) => m.key === k)?.label || k).join(', ') || <span className="text-brick">nothing yet</span>}</td><td className="td">{r.active ? <span className="text-moss">Active</span> : <span className="text-brick">Deactivated</span>}</td><td className="td">{!r.isOwner && <button className="btn-quiet" onClick={() => setEdit({ ...r })}>Edit</button>}</td></tr>)}</tbody></table>
      {edit && <div className="card p-4 mt-4 border-marigold-500">
        <h2 className="font-semibold mb-2">Edit · {edit.name}</h2>
        <div className="grid grid-cols-4 gap-3">
          <div><label className="text-sm font-medium">Name</label><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Email</label><input className="input" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Role</label><select className="input" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}><option value="FACULTY">Teacher</option><option value="STAFF">Staff</option><option value="ADMIN">Co-owner</option></select></div>
          <div><label className="text-sm font-medium">Status</label><select className="input" value={edit.active ? 'on' : 'off'} onChange={(e) => setEdit({ ...edit, active: e.target.value === 'on' })}><option value="on">Active</option><option value="off">Deactivated (cannot log in)</option></select></div>
        </div>
        {edit.role !== 'ADMIN' && <div className="mt-3"><Perms value={edit.modules} onChange={(v) => setEdit({ ...edit, modules: v })} /></div>}
        <div className="flex gap-2 mt-3"><button className="btn" onClick={save}>Save</button><button className="btn-quiet" onClick={() => setEdit(null)}>Cancel</button></div>
      </div>}
    </div>
  );
}
