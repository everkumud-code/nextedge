import { useEffect, useState } from 'react';
import { api } from '../api';

/** Platform team (owner only): managers who help run NextEdge, and sales people who give demos in the demo centres. */
export default function Team() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const load = () => api('/platform/team').then((r) => { setD(r); setErr(''); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  if (err && !d) return <div><h1 className="text-2xl font-bold">Team & demo logins</h1><p className="text-brick mt-4">{err}</p></div>;
  if (!d) return <div className="text-slate-500">Loading…</div>;
  return (
    <div>
      <h1 className="text-2xl font-bold">Team & demo logins</h1>
      <p className="text-sm text-slate-600 mt-1">Give people their own login instead of sharing yours. The login code (OTP) goes to the email you enter here, so use their real email.</p>
      {msg && <div className="card p-3 mt-4 text-sm bg-teal-50 border-teal-300">{msg}</div>}
      <Managers d={d} reload={load} say={setMsg} />
      <Sales d={d} reload={load} say={setMsg} />
    </div>
  );
}

function Form({ kind, d, reload, say }: any) {
  const [f, setF] = useState({ name: '', mobile: '', email: '', title: '' }); const [pick, setPick] = useState<string[]>([]); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const ok = f.name.trim() && /^\d{10}$/.test(f.mobile) && /^\S+@\S+\.\S+$/.test(f.email);
  async function add() {
    setErr(''); setBusy(true);
    try {
      const r = await api('/platform/team', { method: 'POST', body: JSON.stringify({ kind, ...f, centreIds: kind === 'sales' ? pick : undefined }) });
      say(kind === 'manager' ? `${f.name} added. They log in at this site with centre name "Platform" and email ${f.email}. The one-time code goes to that email.` : `${f.name} added to: ${r.login.centres.join(', ')}. They log in with the centre name (for example "${r.login.centres[0]}") and email ${f.email}.${r.skipped?.length ? ` Skipped: ${r.skipped.join('; ')}.` : ''}`);
      setF({ name: '', mobile: '', email: '', title: '' }); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-3">
      <div className="grid grid-cols-4 gap-3 items-end">
        <div><label className="text-sm font-medium">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Mobile (10 digits)</label><input className="input" maxLength={10} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/\D/g, '') })} /></div>
        <div><label className="text-sm font-medium">Email (their login)</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        {kind === 'manager' ? <div><label className="text-sm font-medium">Role (optional)</label><input className="input" placeholder="Support manager" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div> : <div />}
      </div>
      {kind === 'sales' && <div className="mt-3 text-sm"><div className="font-medium mb-1">Demo centres they can open</div><div className="flex flex-wrap gap-3">{d.demoCentres.map((c: any) => <label key={c.id} className="flex items-center gap-1"><input type="checkbox" checked={!pick.length || pick.includes(c.id)} onChange={(e) => { const cur = pick.length ? pick : d.demoCentres.map((x: any) => x.id); setPick(e.target.checked ? [...new Set([...cur, c.id])] : cur.filter((x: string) => x !== c.id)); }} />{c.name}{c.type === 'school' ? ' (school)' : ''}</label>)}{!d.demoCentres.length && <span className="text-slate-500">No demo centre exists yet.</span>}</div></div>}
      <div className="mt-3 flex items-center gap-3"><button className="btn" disabled={!ok || busy} onClick={add}>{busy ? 'Adding…' : kind === 'manager' ? 'Add manager' : 'Add sales person'}</button>{err && <span className="text-brick text-sm">{err}</span>}</div>
    </div>
  );
}

function Managers({ d, reload, say }: any) {
  const [err, setErr] = useState('');
  async function toggle(m: any) { setErr(''); try { await api(`/platform/team/manager/${m.id}/active`, { method: 'PUT', body: JSON.stringify({ active: !m.active }) }); reload(); } catch (e: any) { setErr(e.message); } }
  return (
    <div className="card p-4 mt-5">
      <h2 className="font-semibold">Platform managers</h2>
      <p className="text-sm text-slate-600">They see all clients, billing, plans and messaging. Only you (the owner) can change the email setup, the OTP switch, delete a client or add people here.</p>
      <table className="w-full text-sm mt-3"><thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Mobile</th><th className="th">Role</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{d.managers.map((m: any) => <tr key={m.id}><td className="td font-medium">{m.name}</td><td className="td">{m.email}</td><td className="td">{m.mobile}</td><td className="td">{m.title}</td><td className="td">{m.owner ? <span className="text-slate-500">Owner</span> : m.active ? <span className="text-moss">Active</span> : <span className="text-brick">Switched off</span>}</td><td className="td">{!m.owner && <button className="btn-quiet" onClick={() => toggle(m)}>{m.active ? 'Switch off' : 'Switch on'}</button>}</td></tr>)}</tbody></table>
      {err && <p className="text-brick text-sm mt-2">{err}</p>}
      <h3 className="font-medium mt-4">Add a manager</h3>
      <Form kind="manager" d={d} reload={reload} say={say} />
    </div>
  );
}

function Sales({ d, reload, say }: any) {
  const [err, setErr] = useState('');
  async function toggle(s: any) { setErr(''); try { await api('/platform/team/sales/active', { method: 'PUT', body: JSON.stringify({ email: s.email, active: !s.active }) }); reload(); } catch (e: any) { setErr(e.message); } }
  return (
    <div className="card p-4 mt-5">
      <h2 className="font-semibold">Sales team (demo logins)</h2>
      <p className="text-sm text-slate-600">Each person gets a login to the demo centres only. They can use every feature there to show a demo, but cannot see any real client. When someone leaves, switch them off: it stops them straight away in all demo centres.</p>
      <table className="w-full text-sm mt-3"><thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Mobile</th><th className="th">Demo centres</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{d.sales.map((s: any) => <tr key={s.key}><td className="td font-medium">{s.name}</td><td className="td">{s.email}</td><td className="td">{s.mobile}</td><td className="td">{s.centres.join(', ')}</td><td className="td">{s.active ? <span className="text-moss">Active</span> : <span className="text-brick">Switched off</span>}</td><td className="td"><button className="btn-quiet" onClick={() => toggle(s)}>{s.active ? 'Switch off' : 'Switch on'}</button></td></tr>)}
          {!d.sales.length && <tr><td className="td text-slate-500" colSpan={6}>No sales person yet.</td></tr>}</tbody></table>
      {err && <p className="text-brick text-sm mt-2">{err}</p>}
      <h3 className="font-medium mt-4">Add a sales person</h3>
      <Form kind="sales" d={d} reload={reload} say={say} />
    </div>
  );
}
