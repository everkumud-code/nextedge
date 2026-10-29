import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session } from '../api';
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const dt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const STATUS: Record<string, string> = { trial: 'bg-slate-200', active: 'bg-moss text-white', grace: 'bg-marigold-500', suspended: 'bg-brick text-white' };

/** Platform home for the super admin: clients split into Coaching centres and Schools; create, view people, edit, open in support mode. */
export default function Clients() {
  const [rows, setRows] = useState<any[]>([]); const [plans, setPlans] = useState<any>({}); const [mods, setMods] = useState<string[]>([]); const [tab, setTab] = useState<'coaching' | 'school'>('coaching'); const [q, setQ] = useState(''); const [msg, setMsg] = useState(''); const [create, setCreate] = useState<any | null>(null); const [edit, setEdit] = useState<any | null>(null); const [err, setErr] = useState(''); const [del, setDel] = useState<any | null>(null); const [purge, setPurge] = useState<any | null>(null);
  const load = () => api('/platform/centres').then(setRows); useEffect(() => { load(); api('/platform/plans').then(setPlans); api('/platform/modules').then(setMods); }, []);
  const of = (t: string) => rows.filter((r) => (r.institutionType || 'coaching') === t);
  const shown = useMemo(() => of(tab).filter((r) => !q || `${r.name} ${r.city || ''} ${r.owner?.name || ''} ${r.owner?.email || ''} ${r.owner?.mobile || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, tab, q]);
  const school = tab === 'school';
  const open = (c: any) => { session.viewing({ id: c.id, name: c.name, institutionType: c.institutionType }); location.assign('/'); };
  const blank = () => ({ institutionType: tab, name: '', city: '', plan: 'standard', adminName: '', adminMobile: '', adminEmail: '' });

  async function doCreate() { setErr(''); try { const r = await api('/centres', { method: 'POST', body: JSON.stringify(create) }); setMsg(`${create.name} created. ${r.admin.name} can log in with ${r.admin.email}${school ? '' : ''} — coaching/school name: ${create.name}. 30-day trial started.`); setCreate(null); load(); } catch (e: any) { setErr(e.message); } }
  function startEdit(c: any) { const s = c.settings; setErr(''); setEdit({ id: c.id, orig: c, name: c.name, city: c.city || '', ownerName: c.owner?.name || '', ownerEmail: c.owner?.email || '', ownerMobile: c.owner?.mobile || '', plan: c.plan, price: String(Number(s.pricePerStudent)), minStudents: String(s.minStudents), billingCycle: s.billingCycle, status: s.status, trialEndsAt: s.trialEndsAt || '', paidUntil: s.paidUntil || '', features: [...(s.features || [])], type: c.institutionType || 'coaching' }); }
  async function saveEdit() {
    setErr(''); const c = edit.orig; const s = c.settings;
    try {
      const info = await api(`/platform/centres/${edit.id}/info`, { method: 'PUT', body: JSON.stringify({ name: edit.name, city: edit.city, ownerName: edit.ownerName, ownerEmail: edit.ownerEmail, ownerMobile: edit.ownerMobile }) }); if (info.ok === false) { setErr(info.error); return; }
      const set: any = {}; if (edit.plan !== c.plan) set.plan = edit.plan; if (Number(edit.price) !== Number(s.pricePerStudent) || set.plan) set.pricePerStudent = Number(edit.price); if (Number(edit.minStudents) !== Number(s.minStudents)) set.minStudents = Number(edit.minStudents); if (edit.billingCycle !== s.billingCycle) set.billingCycle = edit.billingCycle; if (edit.status !== s.status) set.status = edit.status; if ((edit.trialEndsAt || '') !== (s.trialEndsAt || '')) set.trialEndsAt = edit.trialEndsAt || null; if ((edit.paidUntil || '') !== (s.paidUntil || '')) set.paidUntil = edit.paidUntil || null;
      if (JSON.stringify([...edit.features].sort()) !== JSON.stringify([...(s.features || [])].sort())) set.features = edit.features;
      if (Object.keys(set).length) { if (set.plan && !set.features) { /* plan change re-applies the plan's modules on the server */ } await api(`/platform/centres/${edit.id}/settings`, { method: 'PUT', body: JSON.stringify(set) }); }
      if (edit.type !== (c.institutionType || 'coaching')) { const apply = confirm(`Switch to ${edit.type}? OK = also reset modules to the ${edit.type} defaults; Cancel = keep current modules.`); await api(`/platform/centres/${edit.id}/type`, { method: 'PUT', body: JSON.stringify({ type: edit.type, applyFeatures: apply }) }); }
      setMsg(`${edit.name} updated`); setEdit(null); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function doDelete() { setErr(''); try { await api(`/platform/centres/${del.c.id}/delete`, { method: 'POST', body: JSON.stringify({ confirmName: del.typed }) }); setMsg(`${del.c.name} and all its data were deleted.`); setDel(null); load(); } catch (e: any) { setErr(e.message); } }
  async function startPurge() { setErr(''); try { const r = await api('/platform/centres/purge-non-demo', { method: 'POST', body: JSON.stringify({ dryRun: true }) }); setPurge({ ...r, typed: '' }); } catch (e: any) { setErr(e.message); } }
  async function doPurge() { setErr(''); try { const r = await api('/platform/centres/purge-non-demo', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) }); setMsg(`Deleted ${r.deleted.length} client(s): ${r.deleted.join(', ')}. Demo clients kept.`); setPurge(null); load(); } catch (e: any) { setErr(e.message); } }
  const F = ({ l, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{l}</label>{children}</div>;
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold">Clients</h1><p className="text-sm text-slate-600">{of('coaching').length} coaching centres · {of('school').length} schools · {rows.reduce((a, r) => a + r.activeStudents, 0)} students in total</p></div><div className="flex gap-2"><button className="btn-quiet text-brick" onClick={startPurge}>Remove all except demo…</button><button className="btn" onClick={() => setCreate(blank())}>+ New {school ? 'school' : 'coaching'}</button></div></div>
      <div className="flex gap-2 mt-4 items-center flex-wrap">{(['coaching', 'school'] as const).map((t) => <button key={t} className={tab === t ? 'btn' : 'btn-quiet'} onClick={() => setTab(t)}>{t === 'coaching' ? 'Coaching centres' : 'Schools'} ({of(t).length})</button>)}<input className="input w-72 ml-auto" placeholder="Search name, city, owner, email, mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {msg && <p className="text-sm mt-3 text-moss">{msg}</p>}
      <table className="card w-full mt-4 text-sm"><thead><tr><th className="th">{school ? 'School' : 'Coaching'}</th><th className="th">{school ? 'Principal / owner' : 'Owner'}</th><th className="th text-right">Students</th><th className="th">Plan</th><th className="th">Status</th><th className="th"></th></tr></thead>
        <tbody>{shown.map((c) => { const s = c.settings; const end = s.status === 'trial' ? s.trialEndsAt : s.paidUntil; return <tr key={c.id}>
          <td className="td"><Link to={`/clients/${c.id}`} className="font-semibold hover:underline">{c.name}</Link><div className="text-xs text-slate-500">{c.city || '—'} · since {dt(c.createdAt)}</div></td>
          <td className="td">{c.owner?.name || '—'}<div className="text-xs text-slate-500">{c.owner?.email || ''} {c.owner?.mobile ? '· ' + c.owner.mobile : ''}</div></td>
          <td className="td text-right font-semibold">{c.activeStudents}</td>
          <td className="td">{c.plan === 'demo' ? <><span className="tag bg-edge-100 text-edge-700">Demo package</span><div className="text-xs text-slate-500">all features · free</div></> : <>{c.plan} <span className="text-xs text-slate-500">{inr(Number(s.pricePerStudent))}/student</span></>}</td>
          <td className="td"><span className={`tag ${STATUS[s.status] || ''}`}>{s.status}</span><div className="text-xs text-slate-500">{end ? `till ${dt(end)}` : ''}{c.openInvoice ? ` · due ${inr(Number(c.openInvoice.amount))}` : ''}</div></td>
          <td className="td whitespace-nowrap"><Link className="btn sm" to={`/clients/${c.id}`}>Students & teachers</Link> <button className="btn-quiet" onClick={() => open(c)}>Open panel</button> <button className="btn-quiet" onClick={() => startEdit(c)}>Edit</button> <button className="btn-quiet text-brick" onClick={() => { setErr(''); setDel({ c, typed: '' }); }}>Delete</button></td></tr>; })}
          {!shown.length && <tr><td className="td text-slate-500" colSpan={6}>{q ? 'No match.' : `No ${school ? 'schools' : 'coaching centres'} yet — create the first one.`}</td></tr>}</tbody></table>

      {del && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setDel(null)}><div className="card p-5 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-lg text-brick">Delete {del.c.name}?</h2>
        <p className="text-sm mt-2">This permanently removes <b>{del.c.name}</b> with its <b>{del.c.activeStudents} students</b>, all teachers and staff, fees, attendance, marks, notices, chats and logins. <b>It cannot be undone.</b></p>
        <label className="text-sm font-medium block mt-4">Type the name to confirm: <span className="font-mono">{del.c.name}</span></label><input className="input mt-1" value={del.typed} onChange={(e) => setDel({ ...del, typed: e.target.value })} autoFocus />
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="flex gap-2 mt-4"><button className="btn bg-brick" disabled={del.typed.trim().toLowerCase() !== del.c.name.trim().toLowerCase()} onClick={doDelete}>Delete permanently</button><button className="btn-quiet" onClick={() => setDel(null)}>Cancel</button></div></div></div>}

      {purge && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setPurge(null)}><div className="card p-5 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold text-lg text-brick">Remove all clients except demo</h2>
        <p className="text-sm mt-2 text-slate-600">Kept: <b>{purge.kept.join(', ') || 'none'}</b></p>
        {purge.willDelete.length === 0 ? <p className="mt-4 text-sm">Nothing to remove — only demo clients exist.</p> : <>
          <p className="text-sm mt-3">These <b>{purge.willDelete.length}</b> client(s) with <b>{purge.willDelete.reduce((a: number, x: any) => a + x.students, 0)} students</b> will be <b>permanently deleted</b>:</p>
          <table className="w-full text-sm mt-2"><tbody>{purge.willDelete.map((x: any) => <tr key={x.id}><td className="td font-medium">{x.name}</td><td className="td"><span className="tag">{x.type}</span></td><td className="td">{x.students} students</td><td className="td text-xs text-slate-500">{x.owner}</td></tr>)}</tbody></table>
          <label className="text-sm font-medium block mt-4">Type <span className="font-mono">DELETE</span> to confirm</label><input className="input mt-1 w-48" value={purge.typed} onChange={(e) => setPurge({ ...purge, typed: e.target.value })} autoFocus /></>}
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="flex gap-2 mt-4">{purge.willDelete.length > 0 && <button className="btn bg-brick" disabled={purge.typed !== 'DELETE'} onClick={doPurge}>Delete {purge.willDelete.length} client(s) permanently</button>}<button className="btn-quiet" onClick={() => setPurge(null)}>{purge.willDelete.length ? 'Cancel' : 'Close'}</button></div></div></div>}

      {create && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setCreate(null)}><div className="card p-5 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between mb-3"><h2 className="font-semibold text-lg">New client</h2><button className="btn-quiet" onClick={() => setCreate(null)}>Close</button></div>
        <div className="grid grid-cols-2 gap-3">
          <F l="Type"><select className="input" value={create.institutionType} onChange={(e) => setCreate({ ...create, institutionType: e.target.value })}><option value="coaching">Coaching centre</option><option value="school">School</option></select></F>
          <F l="Plan"><select className="input" value={create.plan} onChange={(e) => setCreate({ ...create, plan: e.target.value })}>{Object.keys(plans).map((p) => <option key={p} value={p}>{p === 'demo' ? 'demo · all features, free, no expiry' : `${p} · ₹${plans[p].price}/student`}</option>)}</select></F>
          <F l={create.institutionType === 'school' ? 'School name *' : 'Coaching name *'}><input className="input" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} autoFocus /></F>
          <F l="City"><input className="input" value={create.city} onChange={(e) => setCreate({ ...create, city: e.target.value })} /></F>
          <F l={create.institutionType === 'school' ? 'Principal / admin name *' : 'Owner name *'}><input className="input" value={create.adminName} onChange={(e) => setCreate({ ...create, adminName: e.target.value })} /></F>
          <F l="Owner mobile *"><input className="input" maxLength={10} value={create.adminMobile} onChange={(e) => setCreate({ ...create, adminMobile: e.target.value.replace(/\D/g, '') })} /></F>
          <F l="Owner email * (their login)" span={2}><input className="input" type="email" value={create.adminEmail} onChange={(e) => setCreate({ ...create, adminEmail: e.target.value })} /></F></div>
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="flex gap-2 mt-4"><button className="btn" disabled={!create.name || !create.adminName || create.adminMobile.length !== 10 || !create.adminEmail.includes('@')} onClick={doCreate}>Create client</button><button className="btn-quiet" onClick={() => setCreate(null)}>Cancel</button></div>
        {create.plan === 'demo' && <p className="text-sm mt-3 p-2 rounded bg-edge-50"><b>Demo package:</b> every module (school and coaching) is switched on, it is free and never expires or gets billed.</p>}
        <p className="text-xs text-slate-500 mt-2">{create.plan === 'demo' ? 'No trial or billing for the demo package.' : 'A 30-day free trial starts now.'} The owner logs in with the coaching/school name and this email. Modules are set for the type you choose; you can change them any time from Edit.</p></div></div>}

      {edit && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setEdit(null)}><div className="card p-5 w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between mb-3"><h2 className="font-semibold text-lg">Edit — {edit.orig.name}</h2><button className="btn-quiet" onClick={() => setEdit(null)}>Close</button></div>
        <h3 className="text-sm font-semibold text-slate-600 mb-2">Basics & owner</h3>
        <div className="grid grid-cols-3 gap-3"><F l="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></F><F l="City"><input className="input" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></F><F l="Type"><select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="coaching">Coaching centre</option><option value="school">School</option></select></F>
          <F l="Owner name"><input className="input" value={edit.ownerName} onChange={(e) => setEdit({ ...edit, ownerName: e.target.value })} /></F><F l="Owner email (login)"><input className="input" type="email" value={edit.ownerEmail} onChange={(e) => setEdit({ ...edit, ownerEmail: e.target.value })} /></F><F l="Owner mobile"><input className="input" maxLength={10} value={edit.ownerMobile} onChange={(e) => setEdit({ ...edit, ownerMobile: e.target.value.replace(/\D/g, '') })} /></F></div>
        <h3 className="text-sm font-semibold text-slate-600 mt-5 mb-2">Plan & billing</h3>
        <div className="grid grid-cols-4 gap-3"><F l="Plan (changing resets modules)"><select className="input" value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value, price: String(plans[e.target.value]?.price ?? edit.price) })}>{Object.keys(plans).map((p) => <option key={p} value={p}>{p === 'demo' ? 'demo (all features, free)' : p}</option>)}</select></F><F l="₹ per student / month"><input className="input" type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></F><F l="Minimum students billed"><input className="input" type="number" value={edit.minStudents} onChange={(e) => setEdit({ ...edit, minStudents: e.target.value })} /></F><F l="Billing"><select className="input" value={edit.billingCycle} onChange={(e) => setEdit({ ...edit, billingCycle: e.target.value })}><option value="monthly">Monthly</option><option value="annual">Annual (2 months free)</option></select></F>
          <F l="Status"><select className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{['trial', 'active', 'grace', 'suspended'].map((x) => <option key={x}>{x}</option>)}</select></F><F l="Trial ends"><input className="input" type="date" value={edit.trialEndsAt} onChange={(e) => setEdit({ ...edit, trialEndsAt: e.target.value })} /></F><F l="Paid until"><input className="input" type="date" value={edit.paidUntil} onChange={(e) => setEdit({ ...edit, paidUntil: e.target.value })} /></F></div>
        <h3 className="text-sm font-semibold text-slate-600 mt-5 mb-2">Modules switched on ({edit.plan === 'demo' ? mods.length : edit.features.length} of {mods.length}){edit.plan === 'demo' && <span className="font-normal text-slate-500"> — the demo package always has every module</span>}</h3>
        <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-sm">{mods.map((m) => <label key={m} className="flex items-center gap-2"><input type="checkbox" disabled={edit.plan === 'demo'} checked={edit.plan === 'demo' || edit.features.includes(m)} onChange={() => setEdit({ ...edit, features: edit.features.includes(m) ? edit.features.filter((x: string) => x !== m) : [...edit.features, m] })} />{m}</label>)}</div>
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="flex gap-2 mt-5"><button className="btn" onClick={saveEdit}>Save changes</button><button className="btn-quiet" onClick={() => setEdit(null)}>Cancel</button></div></div></div>}
    </div>
  );
}
