import { useEffect, useMemo, useState } from 'react';
import { api, session } from '../api';
import AutoTimetable from './AutoTimetable';
const DAYS = [1, 2, 3, 4, 5, 6]; const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const dayName = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const standard = () => { const out: any[] = []; let t = 8 * 60; const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; for (let i = 1; i <= 8; i++) { out.push({ name: `Period ${i}`, startTime: f(t), endTime: f(t + 40), isBreak: false }); t += 40; if (i === 3) { out.push({ name: 'Short break', startTime: f(t), endTime: f(t + 15), isBreak: true }); t += 15; } if (i === 5) { out.push({ name: 'Lunch', startTime: f(t), endTime: f(t + 30), isBreak: true }); t += 30; } } return out; };

/** School period timetable: bell timings, class-wise weekly grid (clash-checked), teacher load, and substitute teachers. */
export default function TimetableSchool() {
  const user = session.user; const canEdit = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '') || (user?.role === 'STAFF' && (user.modules || []).includes('timetable'));
  const [tab, setTab] = useState<string>(canEdit ? 'grid' : 'mine'); const [batches, setBatches] = useState<any[]>([]); const [faculty, setFaculty] = useState<any[]>([]); const [periods, setPeriods] = useState<any[]>([]); const [batchId, setBatchId] = useState('');
  const loadPeriods = () => api('/timetable/periods').then(setPeriods).catch(() => {});
  useEffect(() => { loadPeriods(); if (canEdit) { api('/batches').then((b) => { setBatches(b); if (b[0]) setBatchId(b[0].id); }); api('/timetable/faculty').then(setFaculty).catch(() => {}); } }, []);
  const tabs: [string, string][] = canEdit ? [['grid', 'Class timetable'], ['auto', 'Auto timetable'], ['subs', 'Substitutions'], ['load', 'Teacher load'], ['bells', 'Bell timings'], ['mine', 'My week']] : [['mine', 'My week']];
  return (
    <div>
      <h1 className="text-2xl font-bold">Timetable</h1>
      <div className="flex gap-2 mt-3 flex-wrap">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'btn' : 'btn-quiet'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'grid' && <Grid batches={batches} faculty={faculty} periods={periods} batchId={batchId} setBatchId={setBatchId} goBells={() => setTab('bells')} />}
      {tab === 'auto' && <AutoTimetable batches={batches} faculty={faculty} periods={periods} goBells={() => setTab('bells')} />}
      {tab === 'bells' && <Bells periods={periods} onSaved={(p: any[]) => setPeriods(p)} />}
      {tab === 'subs' && <Subs batches={batches} />}
      {tab === 'load' && <Load />}
      {tab === 'mine' && <Mine />}
    </div>
  );
}

function Bells({ periods, onSaved }: any) {
  const [rows, setRows] = useState<any[]>([]); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); useEffect(() => { setRows(periods.map((p: any) => ({ name: p.name, startTime: p.startTime, endTime: p.endTime, isBreak: p.isBreak }))); }, [periods]);
  const set = (i: number, k: string, v: any) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  async function save() { setErr(''); setMsg(''); try { const r = await api('/timetable/periods', { method: 'PUT', body: JSON.stringify({ periods: rows.map((r, i) => ({ ...r, no: i + 1 })) }) }); onSaved(r); setMsg('Bell timings saved. Existing periods in the grid follow the new times.'); } catch (e: any) { setErr(e.message); } }
  return (
    <div className="card p-4 mt-4 max-w-3xl"><div className="flex items-center justify-between mb-3"><h2 className="font-semibold">Bell timings</h2><button className="btn-quiet" onClick={() => setRows(standard())}>Use a standard school day</button></div>
      <table className="w-full text-sm"><thead><tr><th className="th w-10">#</th><th className="th">Name</th><th className="th w-32">Starts</th><th className="th w-32">Ends</th><th className="th w-20">Break</th><th className="th w-10"></th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className={r.isBreak ? 'bg-slate-50' : ''}><td className="td text-slate-500">{i + 1}</td><td className="td"><input className="input" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} /></td><td className="td"><input className="input" type="time" value={r.startTime} onChange={(e) => set(i, 'startTime', e.target.value)} /></td><td className="td"><input className="input" type="time" value={r.endTime} onChange={(e) => set(i, 'endTime', e.target.value)} /></td><td className="td"><input type="checkbox" checked={r.isBreak} onChange={(e) => set(i, 'isBreak', e.target.checked)} /></td><td className="td"><button className="text-brick" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td></tr>)}</tbody></table>
      <div className="flex gap-2 mt-3 items-center"><button className="btn-quiet" onClick={() => { const last = rows[rows.length - 1]; setRows([...rows, { name: `Period ${rows.filter((r) => !r.isBreak).length + 1}`, startTime: last?.endTime || '08:00', endTime: '', isBreak: false }]); }}>+ Add period</button><button className="btn" disabled={!rows.length} onClick={save}>Save bell timings</button></div>
      {err && <p className="text-brick text-sm mt-2">{err}</p>}{msg && <p className="text-moss text-sm mt-2">{msg}</p>}
    </div>
  );
}

function Grid({ batches, faculty, periods, batchId, setBatchId, goBells }: any) {
  const [slots, setSlots] = useState<any[]>([]); const [cell, setCell] = useState<any | null>(null); const [err, setErr] = useState('');
  const load = () => batchId && api(`/timetable/grid?batchId=${batchId}`).then((g) => setSlots(g.slots)); useEffect(() => { setCell(null); load(); }, [batchId, periods]);
  const at = (wd: number, no: number) => slots.find((s) => s.weekday === wd && s.period === no);
  async function save(clear = false) { setErr(''); try { await api('/timetable/grid/cell', { method: 'POST', body: JSON.stringify({ batchId, weekday: cell.wd, periodNo: cell.no, subject: clear ? '' : cell.subject, facultyId: cell.facultyId || undefined, room: cell.room || undefined }) }); setCell(null); load(); } catch (e: any) { setErr(e.message); } }
  const subjects = useMemo(() => [...new Set(slots.map((s) => s.subject))], [slots]);
  if (!periods.length) return <div className="card p-6 mt-4"><p>Set the bell timings first (period start and end times).</p><button className="btn mt-3" onClick={goBells}>Set bell timings</button></div>;
  return (
    <div className="mt-4"><div className="flex items-center gap-3"><select className="input w-64" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><span className="text-sm text-slate-500">Click a period to set the subject and teacher. A teacher can never be in two classes at the same time.</span></div>
      <div className="card mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th w-40">Period</th>{DAYS.map((d) => <th key={d} className="th">{DN[d]}</th>)}</tr></thead>
        <tbody>{periods.map((p: any) => <tr key={p.id} className={p.isBreak ? 'bg-slate-100' : ''}><td className="td"><div className="font-medium">{p.name}</div><div className="text-xs text-slate-500">{p.startTime}–{p.endTime}</div></td>
          {p.isBreak ? <td className="td text-center text-xs text-slate-400" colSpan={DAYS.length}>{p.name}</td> : DAYS.map((d) => { const s = at(d, p.no); const open = cell && cell.wd === d && cell.no === p.no; return <td key={d} className="td align-top">
            {open ? <div className="space-y-1 min-w-[150px]"><input className="input" list="subj" placeholder="Subject" autoFocus value={cell.subject} onChange={(e) => setCell({ ...cell, subject: e.target.value })} /><select className="input" value={cell.facultyId} onChange={(e) => setCell({ ...cell, facultyId: e.target.value })}><option value="">Teacher…</option>{faculty.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <div className="flex gap-1"><button className="btn sm" disabled={!cell.subject.trim()} onClick={() => save()}>Save</button>{s && <button className="btn-quiet" onClick={() => save(true)}>Clear</button>}<button className="btn-quiet" onClick={() => { setCell(null); setErr(''); }}>✕</button></div>{err && <div className="text-brick text-xs">{err}</div>}</div>
              : <button className="w-full text-left rounded px-1.5 py-1 hover:bg-edge-50 min-h-[40px]" onClick={() => { setErr(''); setCell({ wd: d, no: p.no, subject: s?.subject || '', facultyId: s?.facultyId || '', room: s?.room || '' }); }}>{s ? <><div className="font-medium">{s.subject}</div><div className="text-xs text-slate-500">{s.facultyName || 'no teacher'}</div></> : <span className="text-slate-300">+</span>}</button>}</td>; })}</tr>)}</tbody></table></div>
      <datalist id="subj">{subjects.map((s) => <option key={s as string} value={s as string} />)}</datalist>
    </div>
  );
}

function Subs({ batches }: any) {
  const [date, setDate] = useState(ymd(new Date())); const [needed, setNeeded] = useState<any[]>([]); const [day, setDay] = useState<any[]>([]); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [man, setMan] = useState<any>({ batchId: '', slots: [], slotId: '', free: [] });
  const load = () => { api(`/timetable/substitutions/needed?date=${date}`).then(setNeeded).catch((e) => setErr(e.message)); api(`/timetable/substitutions?date=${date}`).then(setDay); }; useEffect(load, [date]);
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  async function assign(slotId: string, teacherId: string) { setErr(''); setMsg(''); try { await api('/timetable/substitutions', { method: 'POST', body: JSON.stringify({ date, slotId, substituteFacultyId: teacherId }) }); setMsg('Substitute assigned — the teacher has been notified.'); setMan({ batchId: man.batchId, slots: man.slots, slotId: '', free: [] }); load(); } catch (e: any) { setErr(e.message); } }
  async function pickBatch(id: string) { const g = id ? await api(`/timetable/grid?batchId=${id}`) : { slots: [] }; setMan({ batchId: id, slots: g.slots.filter((s: any) => s.weekday === wd), slotId: '', free: [] }); }
  async function pickSlot(id: string) { const free = id ? await api(`/timetable/substitutions/free?date=${date}&slotId=${id}`) : []; setMan({ ...man, slotId: id, free }); }
  return (
    <div className="mt-4 max-w-4xl"><div className="flex items-center gap-3"><input className="input w-48" type="date" value={date} onChange={(e) => { setDate(e.target.value); setMan({ batchId: '', slots: [], slotId: '', free: [] }); }} /><span className="font-medium">{dayName(date)}</span></div>
      {err && <p className="text-brick text-sm mt-2">{err}</p>}{msg && <p className="text-moss text-sm mt-2">{msg}</p>}
      <h2 className="font-semibold mt-5 mb-2">Periods that need a substitute <span className="text-sm font-normal text-slate-500">(teacher on approved leave)</span></h2>
      {needed.length === 0 ? <div className="card p-4 text-sm text-slate-500">None — every period has its teacher.</div> : <div className="space-y-3">{needed.map((n) => <div key={n.slotId} className="card p-4 border-l-4 border-brick"><div className="flex justify-between flex-wrap gap-2"><div><b>{n.batch}</b> · {n.subject} · {n.startTime}–{n.endTime}</div><div className="text-sm text-slate-600">Absent: {n.absentTeacher}</div></div>
        <div className="mt-2 text-sm">{n.free.length ? <div className="flex flex-wrap gap-2 items-center"><span className="text-slate-500">Free teachers:</span>{n.free.map((f: any) => <button key={f.id} className="btn-quiet" onClick={() => assign(n.slotId, f.id)}>Assign {f.name} <span className="text-xs text-slate-400">({f.periodsThatDay} that day)</span></button>)}</div> : <span className="text-brick">No teacher is free in this period.</span>}</div></div>)}</div>}
      <h2 className="font-semibold mt-6 mb-2">Another period (teacher absent without leave)</h2>
      <div className="card p-4"><div className="flex gap-3 flex-wrap"><select className="input w-56" value={man.batchId} onChange={(e) => pickBatch(e.target.value)}><option value="">Choose class…</option>{batches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="input w-72" value={man.slotId} disabled={!man.slots.length} onChange={(e) => pickSlot(e.target.value)}><option value="">{man.batchId ? (man.slots.length ? 'Choose period…' : `No period on ${DN[wd]}`) : '—'}</option>{man.slots.sort((a: any, b: any) => a.startTime.localeCompare(b.startTime)).map((s: any) => <option key={s.id} value={s.id}>{s.startTime} {s.subject} ({s.facultyName || 'no teacher'})</option>)}</select></div>
        {man.slotId && <div className="mt-3 flex flex-wrap gap-2 items-center text-sm">{man.free.length ? <><span className="text-slate-500">Free:</span>{man.free.map((f: any) => <button key={f.id} className="btn-quiet" onClick={() => assign(man.slotId, f.id)}>Assign {f.name}</button>)}</> : <span className="text-brick">No teacher is free in this period.</span>}</div>}</div>
      <h2 className="font-semibold mt-6 mb-2">Substitutions on this day</h2>
      <table className="card w-full text-sm"><tbody>{day.map((x) => <tr key={x.id}><td className="td whitespace-nowrap">{x.startTime}–{x.endTime}</td><td className="td"><b>{x.batch}</b> · {x.subject}</td><td className="td">{x.originalName} <span className="text-slate-400">→</span> <b>{x.substituteName}</b></td><td className="td text-right"><button className="text-brick text-xs" onClick={async () => { await api(`/timetable/substitutions/${x.id}`, { method: 'DELETE' }); load(); }}>Remove</button></td></tr>)}{!day.length && <tr><td className="td text-slate-500">No substitutions on this day.</td></tr>}</tbody></table>
    </div>
  );
}

function Load() {
  const [rows, setRows] = useState<any[]>([]); useEffect(() => { api('/timetable/teacher-load').then(setRows); }, []); const max = Math.max(1, ...rows.map((r) => r.periodsPerWeek));
  return <table className="card w-full text-sm mt-4 max-w-3xl"><thead><tr><th className="th">Teacher</th><th className="th text-right">Periods / week</th><th className="th w-1/2">Load</th>{[1, 2, 3, 4, 5, 6].map((d) => <th key={d} className="th text-center w-10">{DN[d][0]}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td className="td font-medium">{r.name}</td><td className="td text-right">{r.periodsPerWeek}</td><td className="td"><div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-edge-500" style={{ width: `${(r.periodsPerWeek / max) * 100}%` }} /></div></td>{[1, 2, 3, 4, 5, 6].map((d) => <td key={d} className="td text-center text-slate-600">{r.perDay[d] || '·'}</td>)}</tr>)}{!rows.length && <tr><td className="td text-slate-500">No teachers yet.</td></tr>}</tbody></table>;
}

function Mine() {
  const [d, setD] = useState<any>(null); useEffect(() => { api('/timetable/mine').then(setD); }, []); if (!d) return <p className="text-slate-500 mt-4">Loading…</p>;
  const today = new Date().getDay();
  return <div className="mt-4 max-w-3xl">{d.substitutions.length > 0 && <div className="card p-4 border-l-4 border-marigold-500 mb-4"><div className="font-semibold mb-1">Substitution duties</div>{d.substitutions.map((s: any) => <div key={s.id} className="text-sm">{dayName(s.date)} · {s.startTime}–{s.endTime} · <b>{s.batch}</b> · {s.subject}{s.note ? ` — ${s.note}` : ''}</div>)}</div>}
    <div className="grid grid-cols-2 gap-3">{[1, 2, 3, 4, 5, 6].map((wd) => { const rows = d.slots.filter((s: any) => s.weekday === wd); return <div key={wd} className={`card p-3 ${wd === today ? 'ring-2 ring-edge-500' : ''}`}><div className="font-semibold mb-1">{DN[wd]}{wd === today && <span className="tag ml-2">today</span>}</div>{rows.length ? rows.map((s: any) => <div key={s.id} className="text-sm flex gap-3"><span className="text-slate-500 w-24">{s.startTime}–{s.endTime}</span><span><b>{s.subject}</b> · {s.batch}</span></div>) : <div className="text-sm text-slate-400">No periods</div>}</div>; })}</div></div>;
}
