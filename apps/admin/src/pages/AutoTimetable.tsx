import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 3, Wed 1-2" <-> [{weekday, period}] */
const parseBlocked = (t: string) => { const out: { weekday: number; period: number }[] = []; for (const part of t.split(',')) { const m = part.trim().match(/^([A-Za-z]{3})\w*\s+(\d+)(?:\s*-\s*(\d+))?$/); if (!m) continue; const wd = DN.findIndex((d) => d.toLowerCase() === m[1].toLowerCase()); if (wd < 0) continue; for (let p = Number(m[2]); p <= Number(m[3] || m[2]); p++) out.push({ weekday: wd, period: p }); } return out; };
const showBlocked = (b: { weekday: number; period: number }[]) => { const by = new Map<number, number[]>(); for (const x of b || []) by.set(x.weekday, [...(by.get(x.weekday) || []), x.period].sort((a, c) => a - c)); return [...by.entries()].sort((a, c) => a[0] - c[0]).map(([d, ps]) => `${DN[d]} ${ps.join(',')}`).join(', ').replace(/(\d),(\d)/g, '$1, $2'); };

/** Automatic timetable: 1) teacher limits, 2) subjects per class, 3) make, check and save. */
export default function AutoTimetable({ batches, faculty, periods, goBells }: any) {
  const [step, setStep] = useState<'rules' | 'subjects' | 'make'>('subjects'); const teaching = periods.filter((p: any) => !p.isBreak);
  return (
    <div className="mt-4">
      <div className="card p-4 text-sm bg-teal-50 border-teal-300">Fill in <b>what each class needs</b> and <b>each teacher's limits</b> once. NextEdge then makes every class's week at the same time, so no teacher is in two classes in one period and no class gets two lessons together. You can look at the result first and save only when you are happy.</div>
      {!teaching.length && <div className="card p-4 mt-3 border-marigold-500 bg-marigold-100 text-sm">The bell timings are not set up yet. <button className="underline" onClick={goBells}>Set the bell timings</button> first: the periods of the day and the break.</div>}
      <div className="flex gap-2 mt-4 flex-wrap">{([['rules', '1. Teacher limits'], ['subjects', '2. Subjects per class'], ['make', '3. Make the timetable']] as const).map(([k, l]) => <button key={k} className={step === k ? 'btn' : 'btn-quiet'} onClick={() => setStep(k)}>{l}</button>)}</div>
      {step === 'rules' && <Rules faculty={faculty} />}
      {step === 'subjects' && <Subjects batches={batches} faculty={faculty} periodsPerDay={teaching.length} />}
      {step === 'make' && <Make batches={batches} faculty={faculty} />}
    </div>
  );
}

function Rules({ faculty }: any) {
  const [rows, setRows] = useState<any>({}); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { api('/timetable/auto/rules').then((r: any[]) => { const m: any = {}; for (const x of r) m[x.facultyId] = { maxPerDay: x.maxPerDay ?? '', maxPerWeek: x.maxPerWeek ?? '', offDays: x.offDays || [], blocked: showBlocked(x.blocked) }; setRows(m); }).catch((e) => setErr(e.message)); }, []);
  const get = (id: string) => rows[id] || { maxPerDay: '', maxPerWeek: '', offDays: [], blocked: '' };
  const set = (id: string, k: string, v: any) => setRows({ ...rows, [id]: { ...get(id), [k]: v } });
  async function save() { setErr(''); setMsg(''); try { const rules = faculty.map((f: any) => { const r = get(f.id); return { facultyId: f.id, maxPerDay: r.maxPerDay === '' ? null : Number(r.maxPerDay), maxPerWeek: r.maxPerWeek === '' ? null : Number(r.maxPerWeek), offDays: r.offDays, blocked: parseBlocked(r.blocked || '') }; }); const r = await api('/timetable/auto/rules', { method: 'PUT', body: JSON.stringify({ rules }) }); setMsg(`Saved (${r.saved} teacher${r.saved === 1 ? '' : 's'} with limits).`); } catch (e: any) { setErr(e.message); } }
  return (
    <div className="card p-4 mt-4">
      <h2 className="font-semibold">Teacher limits</h2><p className="text-sm text-slate-600">All optional. Leave a teacher blank to mean "no limit". Days off and blocked periods are never given a class.</p>
      <table className="w-full text-sm mt-3"><thead><tr><th className="th">Teacher</th><th className="th w-24">Max per day</th><th className="th w-24">Max per week</th><th className="th">Day off</th><th className="th">Not free in periods <span className="font-normal text-slate-500">(e.g. Mon 1, Wed 3-4)</span></th></tr></thead>
        <tbody>{faculty.map((f: any) => { const r = get(f.id); return <tr key={f.id}><td className="td font-medium">{f.name}</td>
          <td className="td"><input className="input py-1" type="number" min={1} value={r.maxPerDay} onChange={(e) => set(f.id, 'maxPerDay', e.target.value)} /></td>
          <td className="td"><input className="input py-1" type="number" min={1} value={r.maxPerWeek} onChange={(e) => set(f.id, 'maxPerWeek', e.target.value)} /></td>
          <td className="td whitespace-nowrap">{DN.map((d, i) => <label key={d} className="mr-2"><input type="checkbox" checked={r.offDays.includes(i)} onChange={(e) => set(f.id, 'offDays', e.target.checked ? [...r.offDays, i] : r.offDays.filter((x: number) => x !== i))} /> {d}</label>)}</td>
          <td className="td"><input className="input py-1" value={r.blocked} onChange={(e) => set(f.id, 'blocked', e.target.value)} /></td></tr>; })}
          {!faculty.length && <tr><td className="td text-slate-500" colSpan={5}>No teachers yet. Add them under Staff & privileges.</td></tr>}</tbody></table>
      <div className="mt-3 flex items-center gap-3"><button className="btn" onClick={save}>Save teacher limits</button>{msg && <span className="text-moss text-sm">{msg}</span>}{err && <span className="text-brick text-sm">{err}</span>}</div>
    </div>
  );
}

function Subjects({ batches, faculty, periodsPerDay }: any) {
  const [batchId, setBatchId] = useState(''); const [rows, setRows] = useState<any[]>([]); const [all, setAll] = useState<any[]>([]); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [copyTo, setCopyTo] = useState<string[]>([]); const [days, setDays] = useState(6);
  const loadAll = () => api('/timetable/auto/requirements').then(setAll).catch(() => {}); useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (!batchId && batches[0]) setBatchId(batches[0].id); }, [batches]);
  useEffect(() => { setRows(all.filter((r) => r.batchId === batchId).map((r) => ({ subject: r.subject, facultyId: r.facultyId || '', perWeek: r.perWeek, doubles: r.doubles || 0, maxPerDay: r.maxPerDay ?? '' }))); setMsg(''); setErr(''); setCopyTo([]); }, [batchId, all]);
  const subjects = useMemo(() => [...new Set(all.map((r) => r.subject))].sort(), [all]);
  const total = rows.reduce((n, r) => n + (Number(r.perWeek) || 0), 0); const cap = days * periodsPerDay;
  const set = (i: number, k: string, v: any) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const body = () => rows.filter((r) => r.subject.trim()).map((r) => ({ subject: r.subject.trim(), facultyId: r.facultyId || null, perWeek: Number(r.perWeek) || 1, doubles: Number(r.doubles) || 0, maxPerDay: r.maxPerDay === '' ? null : Number(r.maxPerDay) }));
  async function save() { setErr(''); setMsg(''); try { const r = await api(`/timetable/auto/requirements/${batchId}`, { method: 'PUT', body: JSON.stringify({ rows: body() }) }); setMsg(`Saved ${r.saved} subject${r.saved === 1 ? '' : 's'}.`); loadAll(); } catch (e: any) { setErr(e.message); } }
  async function copy() { setErr(''); setMsg(''); try { await save(); const r = await api('/timetable/auto/requirements/copy', { method: 'POST', body: JSON.stringify({ fromBatchId: batchId, toBatchIds: copyTo }) }); setMsg(`Copied to ${r.copiedTo} class${r.copiedTo === 1 ? '' : 'es'}. Check each one: the teachers may differ by section.`); setCopyTo([]); loadAll(); } catch (e: any) { setErr(e.message); } }
  const count = (id: string) => all.filter((r) => r.batchId === id).reduce((n, r) => n + r.perWeek, 0);
  return (
    <div className="card p-4 mt-4">
      <h2 className="font-semibold">Subjects per class</h2><p className="text-sm text-slate-600">For each class and section: the subjects, who teaches them, and how many periods a week. "Double" means 2 periods back to back (labs, art). You can fill one class and copy it to the other sections.</p>
      <div className="flex items-end gap-3 mt-3 flex-wrap"><div><label className="text-sm font-medium">Class / section</label><select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}{count(b.id) ? ` · ${count(b.id)} periods` : ' · not filled'}</option>)}</select></div>
        <div><label className="text-sm font-medium">School days per week</label><select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div className={`text-sm pb-2 ${total > cap ? 'text-brick font-medium' : 'text-slate-600'}`}>{total} of {cap} periods used ({days} days × {periodsPerDay} periods){total > cap && ' — too many'}</div></div>
      <datalist id="subj">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
      <table className="w-full text-sm mt-3"><thead><tr><th className="th">Subject</th><th className="th">Teacher</th><th className="th w-24">Periods / week</th><th className="th w-24">Double blocks</th><th className="th w-24">Max / day</th><th className="th w-10"></th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}><td className="td"><input className="input py-1" list="subj" value={r.subject} onChange={(e) => set(i, 'subject', e.target.value)} /></td>
          <td className="td"><select className="input py-1" value={r.facultyId} onChange={(e) => set(i, 'facultyId', e.target.value)}><option value="">— no teacher needed —</option>{faculty.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></td>
          <td className="td"><input className="input py-1" type="number" min={1} max={40} value={r.perWeek} onChange={(e) => set(i, 'perWeek', e.target.value)} /></td>
          <td className="td"><input className="input py-1" type="number" min={0} value={r.doubles} onChange={(e) => set(i, 'doubles', e.target.value)} /></td>
          <td className="td"><input className="input py-1" type="number" min={1} placeholder="auto" value={r.maxPerDay} onChange={(e) => set(i, 'maxPerDay', e.target.value)} /></td>
          <td className="td"><button className="btn-quiet" title="Remove this row" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td></tr>)}
          {!rows.length && <tr><td className="td text-slate-500" colSpan={6}>No subjects yet for this class.</td></tr>}</tbody></table>
      <div className="mt-3 flex items-center gap-3 flex-wrap"><button className="btn-quiet" onClick={() => setRows([...rows, { subject: '', facultyId: '', perWeek: 5, doubles: 0, maxPerDay: '' }])}>+ Add subject</button><button className="btn" onClick={save} disabled={!batchId}>Save this class</button>{msg && <span className="text-moss text-sm">{msg}</span>}{err && <span className="text-brick text-sm">{err}</span>}</div>
      {batches.length > 1 && <div className="mt-5 border-t pt-3"><div className="font-medium text-sm">Copy this class's subjects to other sections</div><div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm">{batches.filter((b: any) => b.id !== batchId).map((b: any) => <label key={b.id}><input type="checkbox" checked={copyTo.includes(b.id)} onChange={(e) => setCopyTo(e.target.checked ? [...copyTo, b.id] : copyTo.filter((x) => x !== b.id))} /> {b.name}{count(b.id) ? ' (has a plan)' : ''}</label>)}</div>
        <div className="mt-2 flex items-center gap-3"><button className="btn-quiet" disabled={!copyTo.length || !rows.length} onClick={() => { if (confirm(`Replace the subjects of ${copyTo.length} class(es) with this plan?`)) copy(); }}>Copy to {copyTo.length || ''} selected</button><button className="btn-quiet" onClick={() => setCopyTo(batches.filter((b: any) => b.id !== batchId).map((b: any) => b.id))}>Select all</button></div></div>}
    </div>
  );
}

function Make({ batches, faculty }: any) {
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]); const [pick, setPick] = useState<string[]>([]); const [keep, setKeep] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [res, setRes] = useState<any>(null); const [all, setAll] = useState<any[]>([]); const [view, setView] = useState('class:'); const [audit, setAudit] = useState<any>(null);
  useEffect(() => { api('/timetable/auto/requirements').then((r: any[]) => { setAll(r); setPick([...new Set(r.map((x) => x.batchId))] as string[]); }).catch(() => {}); }, []);
  const filled = new Set(all.map((r) => r.batchId));
  async function make(newSeed = false) { setErr(''); setMsg(''); setBusy(true); try { const r = await api('/timetable/auto/preview', { method: 'POST', body: JSON.stringify({ days, batchIds: pick, keepExisting: keep, seed: newSeed ? Math.floor(Math.random() * 1e9) : undefined }) }); setRes(r); setView(`class:${r.slots[0]?.batchId || r.kept[0]?.batchId || ''}`); } catch (e: any) { setErr(e.message); setRes(null); } finally { setBusy(false); } }
  async function save() { setErr(''); setMsg(''); setBusy(true); try { const r = await api('/timetable/auto/apply', { method: 'POST', body: JSON.stringify({ batchIds: pick, keepExisting: keep, slots: res.slots.map((s: any) => ({ batchId: s.batchId, weekday: s.weekday, period: s.period, subject: s.subject, facultyId: s.facultyId })) }) }); setMsg(`Saved ${r.saved} lessons for ${r.classes} class${r.classes === 1 ? '' : 'es'}. See them under "Class timetable".`); setRes(null); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function check() { setErr(''); try { setAudit(await api('/timetable/auto/audit')); } catch (e: any) { setErr(e.message); } }
  const [kind, id] = view.split(':'); const cells = res ? [...res.slots, ...res.kept] : [];
  return (
    <div className="card p-4 mt-4">
      <h2 className="font-semibold">Make the timetable</h2>
      <div className="mt-3 text-sm"><div className="font-medium mb-1">Working days</div>{[1, 2, 3, 4, 5, 6, 0].map((d) => <label key={d} className="mr-3"><input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} /> {DN[d]}</label>)}</div>
      <div className="mt-3 text-sm"><div className="font-medium mb-1">Classes <button className="text-xs underline ml-2" onClick={() => setPick(batches.filter((b: any) => filled.has(b.id)).map((b: any) => b.id))}>all with subjects</button> <button className="text-xs underline ml-2" onClick={() => setPick([])}>none</button></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">{batches.map((b: any) => <label key={b.id} className={filled.has(b.id) ? '' : 'text-slate-400'}><input type="checkbox" disabled={!filled.has(b.id)} checked={pick.includes(b.id)} onChange={(e) => setPick(e.target.checked ? [...pick, b.id] : pick.filter((x) => x !== b.id))} /> {b.name}{filled.has(b.id) ? '' : ' (no subjects)'}</label>)}</div></div>
      <label className="block mt-3 text-sm"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the lessons already placed in these classes and only fill the rest. <span className="text-slate-500">(Otherwise the chosen classes' timetables are replaced.)</span></label>
      <div className="mt-4 flex items-center gap-3 flex-wrap"><button className="btn" disabled={busy || !pick.length || !days.length} onClick={() => make(false)}>{busy ? 'Working…' : 'Make timetable'}</button>{res && <button className="btn-quiet" disabled={busy} onClick={() => make(true)}>Try another arrangement</button>}<button className="btn-quiet" onClick={check}>Check whole school for clashes</button></div>
      {err && <p className="text-brick text-sm mt-3">{err}</p>}{msg && <p className="text-moss text-sm mt-3">{msg}</p>}
      {audit && <div className={`mt-3 text-sm p-3 rounded ${audit.problems.length ? 'bg-red-50 border border-brick' : 'bg-teal-50 border border-teal-300'}`}>{audit.problems.length ? <><b>{audit.problems.length} problem(s) in the current timetable ({audit.lessons} lessons):</b><ul className="list-disc ml-5 mt-1">{audit.problems.slice(0, 20).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></> : <>✓ No overlaps. {audit.lessons} lessons checked: no teacher is in two places, no class has two lessons at once.</>}</div>}
      {res && <div className="mt-5 border-t pt-4">
        <div className="flex gap-3 flex-wrap text-sm"><span className="px-2 py-1 rounded bg-teal-100">Placed {res.stats.placed} of {res.stats.lessons} periods</span><span className={`px-2 py-1 rounded ${res.problems.length ? 'bg-red-100 text-brick' : 'bg-teal-100'}`}>{res.problems.length ? `${res.problems.length} clash(es)` : '✓ No clashes, no double booking'}</span><span className="px-2 py-1 rounded bg-slate-100">Tried {res.stats.attempts} arrangements</span></div>
        {res.warnings.length > 0 && <ul className="mt-3 text-sm text-brick list-disc ml-5">{res.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>}
        {res.unplaced.length > 0 && <div className="mt-3 text-sm p-3 rounded bg-red-50 border border-brick"><b>Could not place:</b><ul className="list-disc ml-5 mt-1">{res.unplaced.map((u: any, i: number) => <li key={i}><b>{u.batchName} · {u.subject}</b> ({u.teacherName || 'no teacher'}): {u.missing} period(s) missing. {u.reason}</li>)}</ul></div>}
        {res.problems.length > 0 && <ul className="mt-3 text-sm text-brick list-disc ml-5">{res.problems.slice(0, 10).map((p: string, i: number) => <li key={i}>{p}</li>)}</ul>}
        <div className="mt-4 flex items-end gap-3 flex-wrap"><div><label className="text-sm font-medium">View by</label><select className="input" value={kind} onChange={(e) => setView(`${e.target.value}:`)}><option value="class">Class</option><option value="teacher">Teacher</option></select></div>
          <div><label className="text-sm font-medium">{kind === 'class' ? 'Class' : 'Teacher'}</label><select className="input" value={id} onChange={(e) => setView(`${kind}:${e.target.value}`)}>{kind === 'class' ? pick.map((b) => <option key={b} value={b}>{batches.find((x: any) => x.id === b)?.name}</option>) : faculty.filter((f: any) => cells.some((c: any) => c.facultyId === f.id)).map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div></div>
        <Grid res={res} cells={cells} kind={kind} id={id} />
        <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={busy || res.problems.length > 0 || !res.slots.length} onClick={save}>Save this timetable</button><span className="text-sm text-slate-600">{keep ? 'Existing lessons stay; the new ones are added.' : `Replaces the timetable of the ${pick.length} chosen class${pick.length === 1 ? '' : 'es'}.`}</span></div>
      </div>}
    </div>
  );
}

function Grid({ res, cells, kind, id }: any) {
  const days: number[] = [...res.days].sort((a: number, b: number) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)); const mine = cells.filter((c: any) => (kind === 'class' ? c.batchId === id : c.facultyId === id));
  const at = (d: number, p: number) => mine.filter((c: any) => c.weekday === d && c.period === p);
  return (
    <div className="overflow-x-auto mt-3"><table className="w-full text-xs border-collapse"><thead><tr><th className="th w-28">Period</th>{days.map((d) => <th key={d} className="th">{DN[d]}</th>)}</tr></thead>
      <tbody>{res.periods.map((p: any) => p.isBreak ? <tr key={p.no}><td className="td bg-slate-100 text-slate-500" colSpan={days.length + 1}>{p.name} · {p.startTime}–{p.endTime}</td></tr> : <tr key={p.no}><td className="td"><b>{p.name}</b><div className="text-slate-500">{p.startTime}–{p.endTime}</div></td>
        {days.map((d) => { const x = at(d, p.no); return <td key={d} className="td align-top">{x.map((c: any, i: number) => <div key={i} className="rounded bg-marigold-100 p-1 mb-1"><b>{c.subject}</b><div className="text-slate-600">{kind === 'class' ? c.teacherName || '—' : c.batchName}</div></div>)}</td>; })}</tr>)}</tbody></table></div>
  );
}
