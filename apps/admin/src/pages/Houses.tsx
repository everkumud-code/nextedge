import { useEffect, useMemo, useState } from 'react';
import { api, session } from '../api';

const blank = () => ({ id: '', name: '', colour: '', motto: '', masterId: '' });
// Defined outside the screen component on purpose: a component created inside another one is rebuilt on every keystroke and the typing box loses focus.
const F = ({ l, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{l}</label>{children}</div>;
const asList = (r: any) => (Array.isArray(r) ? r : r?.items || []);

/** Houses: create houses (Red, Blue ... or any names), put students in them, name a captain and other roles, award inter-house points. */
export default function Houses() {
  const [d, setD] = useState<any>(null); const [tab, setTab] = useState<'houses' | 'assign' | 'points'>('houses'); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [form, setForm] = useState<any | null>(null); const [staff, setStaff] = useState<any[]>([]); const [sts, setSts] = useState<any[]>([]); const [log, setLog] = useState<any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [cls, setCls] = useState(''); const [onlyFree, setOnlyFree] = useState(true); const [target, setTarget] = useState('');
  const [pt, setPt] = useState({ houseId: '', points: '10', reason: '', studentId: '' }); const [role, setRole] = useState<{ houseId: string; studentId: string; title: string } | null>(null);
  const owner = ['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role || '');
  const load = () => api('/houses').then(setD).catch((e) => setErr(e.message));
  const loadSts = () => api('/students').then((r) => setSts(asList(r).filter((s: any) => s.active !== false))).catch(() => {});
  const loadLog = () => api('/houses/points').then(setLog).catch(() => {});
  useEffect(() => { load(); loadSts(); loadLog(); api('/staff').then((s) => setStaff(asList(s).filter((x: any) => x.role === 'FACULTY'))).catch(() => {}); }, []);
  const classes = useMemo(() => [...new Set(sts.map((s) => s.className).filter(Boolean))].sort() as string[], [sts]);
  const shown = useMemo(() => sts.filter((s) => (!cls || s.className === cls) && (!onlyFree || !s.houseId)), [sts, cls, onlyFree]);
  if (!d) return err ? <p className="text-brick">{err}</p> : <p className="text-slate-500">Loading…</p>;
  const houseName = (id?: string) => d.houses.find((h: any) => h.id === id)?.name || '';
  const run = async (fn: () => Promise<any>, ok: (r: any) => string) => { setErr(''); setMsg(''); try { const r = await fn(); setMsg(ok(r)); load(); loadSts(); loadLog(); return r; } catch (e: any) { setErr(e.message); } };
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const members = (houseId: string) => sts.filter((s) => s.houseId === houseId);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold">Houses</h1><p className="text-sm text-slate-600">Make houses with any names, put every student in one, name the captains and award house points.</p></div>
        <div className="flex gap-2"><button className="btn !text-base !px-5 !py-2.5" onClick={() => { setErr(''); setMsg(''); setForm(blank()); setTab('houses'); }}>+ Add house</button></div></div>
      <div className="grid grid-cols-4 gap-3 mt-4">
        {[['Houses', d.houses.length], ['Students', d.students], ['Not in a house', d.unassigned], ['Leading', d.houses[0] && d.houses[0].points > 0 ? `${d.houses[0].name} · ${d.houses[0].points}` : '—']].map(([l, v]) => <div key={l as string} className="card p-3"><div className="text-xs text-slate-600">{l}</div><div className="text-xl font-bold">{v}</div></div>)}
      </div>
      <div className="flex gap-2 mt-4">{([['houses', 'Houses'], ['assign', 'Put students in houses'], ['points', 'House points']] as const).map(([k, l]) => <button key={k} className={`${tab === k ? 'btn' : 'btn-quiet'} !text-base !px-5 !py-2.5`} onClick={() => { setTab(k); setErr(''); setMsg(''); }}>{l}</button>)}</div>
      {msg && <p className="text-sm text-moss mt-3">{msg}</p>}{err && !form && <p className="text-sm text-brick mt-3">{err}</p>}

      {tab === 'houses' && <>
        {form && <div className="card p-5 mt-4"><h2 className="font-semibold">{form.id ? 'Edit house' : 'New house'}</h2>
          <div className="grid grid-cols-4 gap-3 mt-3">
            <F l="House name *" span={2}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Red / Ashoka / Tagore" /></F>
            <F l="House colour"><div className="flex gap-1.5 items-center h-10">{d.colours.map((c: string) => <button key={c} type="button" aria-label={c} onClick={() => setForm({ ...form, colour: c })} className={`w-7 h-7 rounded-full border-2 ${form.colour === c ? 'border-slate-900' : 'border-white shadow'}`} style={{ background: c }} />)}</div></F>
            <F l="Teacher in charge"><select className="input" value={form.masterId || ''} onChange={(e) => setForm({ ...form, masterId: e.target.value })}><option value="">— none —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
            <F l="House motto (optional)" span={4}><input className="input" value={form.motto} onChange={(e) => setForm({ ...form, motto: e.target.value })} placeholder="Strive for excellence" /></F>
          </div>
          {err && <p className="text-sm text-brick mt-2">{err}</p>}
          <div className="flex gap-2 mt-3"><button className="btn" disabled={!form.name.trim()} onClick={async () => { const r = await run(() => (form.id ? api(`/houses/${form.id}`, { method: 'PUT', body: JSON.stringify({ ...form, colour: form.colour || undefined }) }) : api('/houses', { method: 'POST', body: JSON.stringify({ ...form, colour: form.colour || undefined }) })), () => `${form.name} saved`); if (r) setForm(null); }}>Save house</button><button className="btn-quiet" onClick={() => { setForm(null); setErr(''); }}>Cancel</button></div></div>}
        <div className="grid grid-cols-2 gap-4 mt-4">
          {d.houses.map((h: any) => <div key={h.id} className="card overflow-hidden">
            <div className="px-4 py-3 text-white flex items-center justify-between" style={{ background: h.colour }}><div><div className="text-lg font-bold">{h.name}</div>{h.motto && <div className="text-xs opacity-90">“{h.motto}”</div>}</div><div className="text-right"><div className="text-2xl font-bold">{h.points}</div><div className="text-xs opacity-90">points · rank {h.rank}</div></div></div>
            <div className="p-4 text-sm">
              <div className="flex gap-6"><span><b>{h.strength}</b> students</span><span>{h.boys} boys · {h.girls} girls</span></div>
              <div className="mt-1 text-slate-600">Teacher in charge: <b>{h.master || '—'}</b></div>
              <div className="mt-3"><div className="font-medium">Captains & roles</div>
                {h.roles.length ? <ul className="mt-1 space-y-1">{h.roles.map((r: any) => <li key={r.id} className="flex items-center justify-between"><span><b>{r.title}</b> — {r.name} <span className="text-xs text-slate-500">{r.className}</span></span><button className="btn-quiet !py-0.5" onClick={() => run(() => api(`/houses/roles/${r.id}`, { method: 'DELETE' }), () => 'Role removed')}>×</button></li>)}</ul> : <p className="text-slate-500">No captain named yet.</p>}
                {role && role.houseId === h.id ? <div className="mt-2 flex gap-2 flex-wrap items-center"><input className="input w-44 py-1" list="role-titles" placeholder="Role (House Captain)" value={role.title} onChange={(e) => setRole({ ...role, title: e.target.value })} /><datalist id="role-titles">{d.roleSuggestions.map((r: string) => <option key={r} value={r} />)}</datalist>
                  <select className="input w-48 py-1" value={role.studentId} onChange={(e) => setRole({ ...role, studentId: e.target.value })}><option value="">— student of this house —</option>{members(h.id).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.className || ''})</option>)}</select>
                  <button className="btn !py-1" disabled={!role.title || !role.studentId} onClick={async () => { const r = await run(() => api('/houses/roles', { method: 'POST', body: JSON.stringify(role) }), () => 'Role given'); if (r) setRole(null); }}>Give</button><button className="btn-quiet !py-1" onClick={() => setRole(null)}>Cancel</button></div>
                  : <button className="btn-quiet mt-2" onClick={() => { setErr(''); setRole({ houseId: h.id, studentId: '', title: 'House Captain' }); }}>+ Name a captain / role</button>}
                {role?.houseId === h.id && err && <p className="text-xs text-brick mt-1">{err}</p>}</div>
              <div className="flex gap-2 mt-3"><button className="btn-quiet" onClick={() => { setErr(''); setMsg(''); setForm({ ...blank(), ...h, masterId: h.masterId || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>{owner && <button className="btn-quiet" onClick={() => { if (confirm(`Delete the house ${h.name}? Its ${h.strength} students become “not in a house”, and its roles and points are removed.`)) run(() => api(`/houses/${h.id}`, { method: 'DELETE' }), () => `${h.name} deleted`); }}>Delete</button>}</div>
            </div></div>)}
          {!d.houses.length && <div className="card p-6 col-span-2 text-slate-600">No house yet. Press “+ Add house”. Most schools have four, for example Red, Blue, Green and Yellow.</div>}
        </div>
      </>}

      {tab === 'assign' && <div className="card p-5 mt-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div><label className="text-sm font-medium">Class</label><select className="input w-44" value={cls} onChange={(e) => { setCls(e.target.value); setSel(new Set()); }}><option value="">All classes</option>{classes.map((c) => <option key={c}>{c}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Only students not in a house</label>
          <div><label className="text-sm font-medium">Put selected in</label><select className="input w-44" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">— choose house —</option>{d.houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}<option value="__none">(take out of house)</option></select></div>
          <button className="btn" disabled={!sel.size || !target} onClick={async () => { const r = await run(() => api('/houses/assign/bulk', { method: 'PUT', body: JSON.stringify({ studentIds: [...sel], houseId: target === '__none' ? null : target }) }), (r) => `${r.count} student${r.count === 1 ? '' : 's'} updated`); if (r) setSel(new Set()); }}>Assign {sel.size || ''} selected</button>
          <button className="btn-quiet ml-auto" disabled={!d.houses.length || !d.unassigned} title="Boys and girls are shared equally between the houses; nobody who already has a house is moved" onClick={() => { if (confirm(`Share the ${d.unassigned} students who have no house equally between the ${d.houses.length} houses?`)) run(() => api('/houses/auto-assign', { method: 'POST' }), (r) => `${r.assigned} students put in houses, evenly`); }}>Auto-assign {d.unassigned} students equally</button>
        </div>
        {err && <p className="text-sm text-brick mt-2">{err}</p>}
        <div className="mt-3 max-h-[520px] overflow-auto border rounded-md"><table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr><th className="th w-10"><input type="checkbox" checked={shown.length > 0 && shown.every((s) => sel.has(s.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((s) => s.id)) : new Set())} /></th><th className="th">Student</th><th className="th">Class</th><th className="th">Gender</th><th className="th">House</th></tr></thead><tbody>
          {shown.map((s) => <tr key={s.id} className="hover:bg-teal-50 cursor-pointer" onClick={() => toggle(s.id)}><td className="td"><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td><td className="td">{s.name}</td><td className="td">{s.className || ''}</td><td className="td">{s.gender || ''}</td><td className="td">{s.houseId ? <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: d.houses.find((h: any) => h.id === s.houseId)?.colour }} />{houseName(s.houseId)}</span> : <span className="text-slate-400">—</span>}</td></tr>)}
          {!shown.length && <tr><td className="td text-slate-500" colSpan={5}>{onlyFree ? 'Every student here already has a house.' : 'No student.'}</td></tr>}</tbody></table></div>
      </div>}

      {tab === 'points' && <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="card p-5"><h2 className="font-semibold">Award points</h2>
          <div className="space-y-2 mt-3">
            <F l="House"><select className="input" value={pt.houseId} onChange={(e) => setPt({ ...pt, houseId: e.target.value, studentId: '' })}><option value="">— choose —</option>{d.houses.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></F>
            <F l="Points (use minus to take away)"><input className="input" type="number" value={pt.points} onChange={(e) => setPt({ ...pt, points: e.target.value })} /></F>
            <F l="Reason"><input className="input" placeholder="Won the relay race" value={pt.reason} onChange={(e) => setPt({ ...pt, reason: e.target.value })} /></F>
            <F l="Student (optional)"><select className="input" value={pt.studentId} onChange={(e) => setPt({ ...pt, studentId: e.target.value })} disabled={!pt.houseId}><option value="">— whole house —</option>{members(pt.houseId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
          </div>
          {err && <p className="text-sm text-brick mt-2">{err}</p>}
          <button className="btn mt-3" disabled={!pt.houseId || !pt.reason.trim() || !Number(pt.points)} onClick={async () => { const r = await run(() => api('/houses/points', { method: 'POST', body: JSON.stringify({ ...pt, points: Number(pt.points), studentId: pt.studentId || undefined }) }), () => 'Points added'); if (r) setPt({ ...pt, reason: '', studentId: '' }); }}>Add points</button>
        </div>
        <div className="col-span-2 space-y-4">
          <div className="card p-5"><h2 className="font-semibold">Leaderboard</h2><div className="mt-3 space-y-2">{d.houses.map((h: any) => { const max = Math.max(1, ...d.houses.map((x: any) => Math.abs(x.points))); return <div key={h.id} className="flex items-center gap-3"><span className="w-6 text-center font-bold">{h.rank}</span><span className="w-28 font-medium">{h.name}</span><div className="flex-1 h-5 bg-slate-100 rounded"><div className="h-5 rounded" style={{ width: `${Math.max(2, (Math.max(0, h.points) / max) * 100)}%`, background: h.colour }} /></div><span className="w-14 text-right font-bold">{h.points}</span></div>; })}{!d.houses.length && <p className="text-sm text-slate-500">Add houses first.</p>}</div></div>
          <div className="card p-5"><h2 className="font-semibold">Recent points</h2><table className="w-full text-sm mt-2"><thead><tr><th className="th">Date</th><th className="th">House</th><th className="th">Points</th><th className="th">Reason</th><th className="th"></th></tr></thead><tbody>
            {log.slice(0, 30).map((l) => <tr key={l.id}><td className="td">{l.date}</td><td className="td">{houseName(l.houseId)}</td><td className={`td font-bold ${l.points < 0 ? 'text-brick' : 'text-moss'}`}>{l.points > 0 ? '+' : ''}{l.points}</td><td className="td">{l.reason}{l.studentName ? <span className="text-xs text-slate-500"> · {l.studentName}</span> : ''}</td><td className="td">{owner && <button className="btn-quiet !py-0.5" onClick={() => run(() => api(`/houses/points/${l.id}`, { method: 'DELETE' }), () => 'Entry removed')}>×</button>}</td></tr>)}
            {!log.length && <tr><td className="td text-slate-500" colSpan={5}>No points yet.</td></tr>}</tbody></table></div>
        </div>
      </div>}
    </div>
  );
}
