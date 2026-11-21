import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openPdf } from '../api';

// ---------- the parent portal: read-only screens for the children linked to this mobile number ----------
const inr = (n: number) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const ymd = (d?: string | null) => String(d || '').slice(0, 10);
const dlong = (d?: string | null) => (d ? new Date(ymd(d) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const dshort = (d?: string | null) => (d ? new Date(ymd(d) + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
const monthName = (m: string) => new Date(m + '-01T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const tone = (pct: number | null) => (pct === null ? 'text-slate-400' : pct >= 75 ? 'text-moss' : pct >= 50 ? 'text-amber-700' : 'text-brick');
const bg = (pct: number | null) => (pct === null ? '#E2E8F0' : pct >= 75 ? '#2E7D32' : pct >= 50 ? '#F9A825' : '#C62828');
export const ST_COLOUR: Record<string, string> = { PRESENT: '#2E7D32', LATE: '#F9A825', ABSENT: '#C62828', LEAVE: '#90A4AE' };
const LEVEL: Record<string, string> = { bad: 'bg-red-50 border-red-300 text-red-900', warn: 'bg-amber-50 border-amber-300 text-amber-900', info: 'bg-sky-50 border-sky-300 text-sky-900', good: 'bg-emerald-50 border-emerald-300 text-emerald-900' };

export function Card({ title, right, children, className = '' }: { title?: string; right?: any; children: any; className?: string }) {
  return <div className={`card p-4 ${className}`}>{(title || right) && <div className="flex justify-between items-center mb-3"><h2 className="font-semibold">{title}</h2>{right}</div>}{children}</div>;
}
const Empty = ({ t }: { t: string }) => <p className="text-sm text-slate-500">{t}</p>;
const Chip = ({ t, c = 'bg-slate-200 text-slate-700' }: { t: string; c?: string }) => <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${c}`}>{t}</span>;

/** Which child is open is remembered, and every parent screen follows it. */
const KEY = 'ne_child';
function useFamily() {
  const [ov, setOv] = useState<any>(null); const [err, setErr] = useState(''); const [sel, setSel] = useState<string>(() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } });
  useEffect(() => { api('/parent/overview').then(setOv).catch((e) => setErr(e.message)); }, []);
  const kids: any[] = ov?.children || []; const cur = kids.find((k) => k.id === sel) || kids[0];
  const pick = (id: string) => { setSel(id); try { localStorage.setItem(KEY, id); } catch { /* ignore */ } };
  return { ov, kids, cur, pick, err };
}
function useChild(id?: string) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { setD(null); setErr(''); if (id) api('/parent/child/' + id).then(setD).catch((e) => setErr(e.message)); }, [id]);
  return { d, err, reload: () => id && api('/parent/child/' + id).then(setD).catch(() => {}) };
}
export function ChildPicker({ kids, cur, pick }: { kids: any[]; cur: any; pick: (id: string) => void }) {
  if (kids.length < 2) return null;
  return <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a child">{kids.map((k) => <button key={k.id} role="tab" aria-selected={k.id === cur?.id} className={k.id === cur?.id ? 'btn' : 'btn-quiet'} onClick={() => pick(k.id)}>{k.name}{k.alerts?.some((a: any) => a.level === 'bad' || a.level === 'warn') ? ' •' : ''}</button>)}</div>;
}

/** Every parent screen is this shell: the child picker on top, the screen's own title, then its content for the chosen child. */
function Shell({ title, sub, children }: { title: string; sub?: string; children: (k: any, d: any, reload: () => void) => any }) {
  const { kids, cur, pick, err: e1, ov } = useFamily(); const { d, err: e2, reload } = useChild(cur?.id);
  if (e1) return <p className="text-brick">{e1}</p>;
  if (!ov) return <p className="text-slate-500">Loading…</p>;
  if (!kids.length) return <p className="text-slate-500">No student is linked to this login yet. Please ask the school office to add your mobile number to your child's record.</p>;
  return <div className="space-y-4">
    <div><h1 className="text-xl font-bold">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
    <ChildPicker kids={kids} cur={cur} pick={pick} />
    {cur && <div className="text-sm text-slate-600"><b>{cur.name}</b> · {[cur.className, cur.section && `Section ${cur.section}`, cur.rollNo && `Roll ${cur.rollNo}`].filter(Boolean).join(' · ')}</div>}
    {e2 ? <p className="text-brick">{e2}</p> : !d ? <p className="text-slate-500">Loading…</p> : children(cur, d, reload)}
  </div>;
}

/** "Needs your attention", shown at the top of the home screen for each child. */
export function Attention({ kids }: { kids: any[] }) {
  let all = kids.flatMap((k) => (k.alerts || []).map((a: any) => ({ ...a, kid: k })));
  if (all.some((a) => a.to !== '/')) all = all.filter((a) => a.to !== '/'); // the "nothing needs attention" line only shows when there is nothing else
  if (!all.length) return null;
  return <div className="space-y-2" aria-label="Needs your attention">{all.map((a, i) => <Link key={i} to={a.to} className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${LEVEL[a.level]}`}><span aria-hidden>{a.level === 'bad' ? '⚠️' : a.level === 'warn' ? '🔔' : a.level === 'good' ? '✅' : 'ℹ️'}</span><span className="flex-1">{a.text}</span><span className="underline text-xs">Open</span></Link>)}</div>;
}

// ---------- Progress: marks, grades, trend, report card ----------
export function Progress() {
  return <Shell title="Progress" sub="Marks, grades and report cards. Results appear here as soon as the school publishes them.">{(k, d) => <ProgressBody k={k} d={d} />}</Shell>;
}
function ProgressBody({ k, d }: { k: any; d: any }) {
  const [cards, setCards] = useState<any[] | null>(null);
  useEffect(() => { setCards(null); api('/exams/mine?studentId=' + k.id).then(setCards).catch(() => setCards([])); }, [k.id]);
  if (!cards) return <p className="text-slate-500">Loading…</p>;
  const ok = cards.filter((c) => c.maxTotal > 0); const last = ok[ok.length - 1]; const prev = ok[ok.length - 2];
  const subjects = [...new Set(ok.flatMap((c) => c.subjects.map((s: any) => s.name)))] as string[];
  const lastSubs = (last?.subjects || []).filter((s: any) => s.marks !== null && s.max > 0).map((s: any) => ({ ...s, pct: Math.round((s.marks / s.max) * 100) })).sort((a: any, b: any) => b.pct - a.pct);
  const delta = last && prev ? Math.round((last.pct - prev.pct) * 10) / 10 : null;
  return <div className="space-y-4">
    {last ? <Card title={`Latest result: ${last.examName}`} right={<button className="btn-quiet" onClick={() => openPdf(`/exams/report-card/${k.id}.pdf`)}>Download report card (PDF)</button>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div><div className="text-xs uppercase text-slate-500">Percentage</div><div className={`text-3xl font-bold ${tone(last.pct)}`}>{last.pct}%</div>{delta !== null && <div className={`text-xs ${delta >= 0 ? 'text-moss' : 'text-brick'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} points since {prev.examName}</div>}</div>
        <div><div className="text-xs uppercase text-slate-500">Grade</div><div className="text-3xl font-bold">{last.grade}</div></div>
        <div><div className="text-xs uppercase text-slate-500">Marks</div><div className="text-3xl font-bold">{last.total}<span className="text-base font-normal text-slate-500">/{last.maxTotal}</span></div></div>
        <div><div className="text-xs uppercase text-slate-500">Class position</div><div className="text-3xl font-bold">{last.rank ? `#${last.rank}` : '—'}</div>{last.of > 0 && <div className="text-xs text-slate-500">of {last.of} students</div>}</div>
      </div>
      {lastSubs.length > 1 && <p className="text-sm mt-3 text-slate-700">Strongest: <b>{lastSubs[0].name}</b> ({lastSubs[0].pct}%). {lastSubs[lastSubs.length - 1].pct < 60 ? <>Needs more help: <b className="text-brick">{lastSubs[lastSubs.length - 1].name}</b> ({lastSubs[lastSubs.length - 1].pct}%).</> : <>Weakest: <b>{lastSubs[lastSubs.length - 1].name}</b> ({lastSubs[lastSubs.length - 1].pct}%).</>}</p>}
    </Card> : <Card><Empty t="No result has been published yet. You will see marks, grades and the class position here as soon as the school publishes them." /></Card>}
    {ok.length > 1 && <Card title="Trend across exams"><div className="flex items-end gap-3 h-36">{ok.map((c) => <div key={c.id} className="flex-1 flex flex-col items-center justify-end h-full"><div className="text-xs font-semibold">{c.pct}%</div><div className="w-full max-w-[56px] rounded-t" style={{ height: `${Math.max(4, c.pct)}%`, background: bg(c.pct) }} /><div className="text-[11px] text-slate-500 mt-1 text-center leading-tight">{c.examName}</div></div>)}</div></Card>}
    {subjects.length > 0 && <Card title="Subject by subject"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-3">Subject</th>{ok.map((c) => <th key={c.id} className="py-1 px-2 whitespace-nowrap">{c.examName}</th>)}</tr></thead><tbody>{subjects.map((sub) => <tr key={sub} className="border-t"><td className="py-1.5 pr-3 font-medium">{sub}</td>{ok.map((c) => { const s = c.subjects.find((x: any) => x.name === sub); const p = s && s.marks !== null && s.max ? Math.round((s.marks / s.max) * 100) : null; return <td key={c.id} className="py-1.5 px-2 whitespace-nowrap">{!s ? '—' : s.absent ? <Chip t="Absent" c="bg-slate-200" /> : s.marks === null ? '—' : <span><b className={tone(p)}>{s.marks}</b><span className="text-slate-500">/{s.max}</span> <span className="text-xs text-slate-500">{s.grade}</span></span>}</td>; })}</tr>)}</tbody></table></div></Card>}
    {d.upcomingExams?.length > 0 && <Card title="Coming up">{d.upcomingExams.map((e: any) => <div key={e.id} className="flex justify-between text-sm py-1"><span>{e.name}{e.term ? ` · ${e.term}` : ''}</span><b>{dlong(e.date)}</b></div>)}</Card>}
    <RecordList kind="report-remark" child={k} title="Teacher's remarks on the report card" none="" pick={(r) => ({ head: r.title, text: [r.data.remark, r.data.discipline && `Discipline: ${r.data.discipline}`].filter(Boolean).join(' · ') })} />
  </div>;
}

// ---------- Attendance and leave ----------
export function AttendancePage() {
  return <Shell title="Attendance" sub="Every school day, month by month. Apply for leave here.">{(k, d, reload) => <AttendanceBody k={k} d={d} reload={reload} />}</Shell>;
}
function AttendanceBody({ k, d, reload }: { k: any; d: any; reload: () => void }) {
  const a = d.attendance; const [month, setMonth] = useState(istToday().slice(0, 7)); const byDay = useMemo(() => new Map<string, string>(a.days.map((x: any) => [ymd(x.date), x.status])), [a.days]);
  const first = new Date(month + '-01T00:00:00Z'); const lead = (first.getUTCDay() + 6) % 7; const n = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const [f, setF] = useState({ fromDate: istToday(), toDate: istToday(), reason: '' }); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => { setMsg(''); if (!f.reason.trim()) return setMsg('Please write the reason.'); if (f.toDate < f.fromDate) return setMsg('The last day cannot be before the first day.'); setBusy(true); try { await api('/leaves', { method: 'POST', body: JSON.stringify({ studentId: k.id, ...f, reason: f.reason.trim() }) }); setMsg('Sent to the school. You will see the answer here.'); setF({ ...f, reason: '' }); reload(); } catch (e: any) { setMsg(e.message); } setBusy(false); };
  const months = a.months as any[];
  return <div className="space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card><div className="text-xs uppercase text-slate-500">Overall (last 6 months)</div><div className={`text-3xl font-bold ${tone(a.overallPct)}`}>{a.overallPct === null ? '—' : a.overallPct + '%'}</div></Card>
      {months[0] && <><Card><div className="text-xs uppercase text-slate-500">{monthName(months[0].month).split(' ')[0]}</div><div className={`text-3xl font-bold ${tone(months[0].pct)}`}>{months[0].pct === null ? '—' : months[0].pct + '%'}</div><div className="text-xs text-slate-500">{months[0].present + months[0].late} present of {months[0].marked}</div></Card>
        <Card><div className="text-xs uppercase text-slate-500">Absent this month</div><div className={`text-3xl font-bold ${months[0].absent ? 'text-brick' : 'text-moss'}`}>{months[0].absent}</div></Card>
        <Card><div className="text-xs uppercase text-slate-500">Late arrivals</div><div className="text-3xl font-bold">{months[0].late}</div></Card></>}
    </div>
    <Card title={monthName(month)} right={<div className="flex gap-2"><button className="btn-quiet" aria-label="Previous month" onClick={() => setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() - 1, 1)).toISOString().slice(0, 7))}>‹</button><button className="btn-quiet" aria-label="Next month" disabled={month >= istToday().slice(0, 7)} onClick={() => setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)).toISOString().slice(0, 7))}>›</button></div>}>
      <div className="grid grid-cols-7 gap-1.5 text-center text-xs max-w-md">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => <div key={x} className="text-slate-500">{x}</div>)}{cells.map((c, i) => c === null ? <div key={i} /> : <div key={i} title={`${dshort(c)} · ${byDay.get(c) || 'no record'}`} className="aspect-square rounded grid place-items-center" style={{ background: byDay.get(c) ? ST_COLOUR[byDay.get(c)!] : '#F1F5F9', color: byDay.get(c) ? '#fff' : '#94A3B8' }}>{Number(c.slice(8))}</div>)}</div>
      <div className="flex gap-3 text-xs text-slate-500 mt-3 flex-wrap">{Object.entries(ST_COLOUR).map(([s, c]) => <span key={s}><i className="inline-block w-2.5 h-2.5 rounded mr-1" style={{ background: c }} />{s[0] + s.slice(1).toLowerCase()}</span>)}<span><i className="inline-block w-2.5 h-2.5 rounded mr-1 bg-slate-200" />No class / not marked</span></div>
    </Card>
    {months.length > 0 && <Card title="Month by month"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Month</th><th>Present</th><th>Late</th><th>Absent</th><th>Leave</th><th className="w-1/3">Attendance</th></tr></thead><tbody>{months.map((m) => <tr key={m.month} className="border-t"><td className="py-1.5">{monthName(m.month)}</td><td>{m.present}</td><td>{m.late}</td><td className={m.absent ? 'text-brick font-medium' : ''}>{m.absent}</td><td>{m.leave}</td><td><div className="flex items-center gap-2"><div className="flex-1 h-2.5 bg-slate-100 rounded"><div className="h-2.5 rounded" style={{ width: `${m.pct ?? 0}%`, background: bg(m.pct) }} /></div><b className={`w-10 text-right ${tone(m.pct)}`}>{m.pct === null ? '—' : m.pct + '%'}</b></div></td></tr>)}</tbody></table></Card>}
    <Card title="Apply for leave"><div className="grid sm:grid-cols-3 gap-3"><label className="text-sm">From<input type="date" className="input w-full" value={f.fromDate} onChange={(e) => setF({ ...f, fromDate: e.target.value, toDate: e.target.value > f.toDate ? e.target.value : f.toDate })} /></label><label className="text-sm">To<input type="date" className="input w-full" min={f.fromDate} value={f.toDate} onChange={(e) => setF({ ...f, toDate: e.target.value })} /></label><label className="text-sm sm:col-span-3">Reason<input className="input w-full" value={f.reason} maxLength={300} placeholder="For example: fever, family function" onChange={(e) => setF({ ...f, reason: e.target.value })} /></label></div><div className="mt-3 flex items-center gap-3"><button className="btn" disabled={busy} onClick={send}>Send to school</button>{msg && <span className="text-sm text-slate-600" role="status">{msg}</span>}</div>
      {d.leaves.length > 0 && <div className="mt-4 border-t pt-3 text-sm space-y-1">{d.leaves.map((l: any) => <div key={l.id} className="flex justify-between gap-2"><span>{dshort(l.fromDate)}{l.toDate !== l.fromDate ? ` to ${dshort(l.toDate)}` : ''} · {l.reason}{l.note ? <span className="text-slate-500"> — {l.note}</span> : null}</span><Chip t={l.status} c={l.status === 'approved' ? 'bg-moss text-white' : l.status === 'rejected' ? 'bg-brick text-white' : 'bg-amber-200 text-amber-900'} /></div>)}</div>}
    </Card>
  </div>;
}

// ---------- Homework, study material, lesson diary ----------
export function HomeworkPage() {
  return <Shell title="Homework & study" sub="What is due, what was taught, and study material from the teachers.">{(k, d) => <HomeworkBody k={k} d={d} />}</Shell>;
}
function HomeworkBody({ k, d }: { k: any; d: any }) {
  const [hw, setHw] = useState<any[] | null>(null); const [study, setStudy] = useState<any[]>([]);
  useEffect(() => { setHw(null); api('/homework').then(setHw).catch(() => setHw([])); api('/content').then(setStudy).catch(() => setStudy([])); }, [k.id]);
  if (!hw) return <p className="text-slate-500">Loading…</p>;
  const batch = d.profile.batchId; const now = Date.now();
  const mine = hw.filter((h) => h.batchId === batch).map((h) => { const s = (h.submissions || []).find((x: any) => x.studentId === k.id); return { ...h, sub: s, status: s ? 'done' : new Date(h.dueAt).getTime() < now ? 'overdue' : 'pending' }; });
  const open = mine.filter((h) => h.status !== 'done').sort((a, b) => a.dueAt.localeCompare(b.dueAt)); const done = mine.filter((h) => h.status === 'done');
  const mat = study.filter((c) => !c.batchId || c.batchId === batch).slice(0, 30);
  return <div className="space-y-4">
    <Card title={`To do (${open.length})`}>{open.length ? <ul className="divide-y text-sm">{open.map((h) => <li key={h.id} className="py-2 flex justify-between gap-3"><span><b>{h.title}</b>{h.subject && <span className="text-slate-500"> · {h.subject}</span>}{h.description && <div className="text-slate-600">{h.description}</div>}{h.attachmentUrl && <a className="underline text-xs" href={h.attachmentUrl} target="_blank" rel="noreferrer">Open the attachment</a>}</span><span className="text-right shrink-0"><div className="text-xs text-slate-500">due {dlong(h.dueAt)}</div><Chip t={h.status === 'overdue' ? 'Overdue' : 'Pending'} c={h.status === 'overdue' ? 'bg-brick text-white' : 'bg-marigold-500'} /></span></li>)}</ul> : <Empty t="Nothing pending. All homework is handed in." />}</Card>
    {done.length > 0 && <Card title="Handed in">{<ul className="divide-y text-sm">{done.slice(0, 12).map((h) => <li key={h.id} className="py-2 flex justify-between gap-3"><span><b>{h.title}</b>{h.subject && <span className="text-slate-500"> · {h.subject}</span>}{h.sub?.remark && <div className="text-slate-600">Teacher: {h.sub.remark}</div>}</span><span className="shrink-0">{h.sub?.checkedAt ? <Chip t={h.sub.grade ? `Checked · ${h.sub.grade}` : 'Checked'} c="bg-moss text-white" /> : <Chip t="Waiting for teacher" />}</span></li>)}</ul>}</Card>}
    <RecordList kind="lesson" child={k} batch={d.profile} title="What was taught recently" none="The teachers have not added a lesson diary yet." limit={8} pick={(r) => ({ head: r.title, meta: [r.data.subject, dshort(r.date)].filter(Boolean).join(' · '), text: [r.data.details, r.data.homework && `Homework: ${r.data.homework}`].filter(Boolean).join(' — ') })} />
    <Card title="Study material">{mat.length ? <ul className="divide-y text-sm">{mat.map((c) => <li key={c.id} className="py-2 flex justify-between gap-3"><span><b>{c.title}</b><span className="text-slate-500"> · {c.subject}{c.chapter ? ` · ${c.chapter}` : ''}</span>{c.body && <div className="text-slate-600">{String(c.body).slice(0, 160)}</div>}</span>{c.url ? <a className="underline shrink-0" href={c.url} target="_blank" rel="noreferrer">Open</a> : c.fileKey ? <button className="underline shrink-0" onClick={() => api(`/content/${c.id}/file`).then((r) => r?.url && window.open(r.url, '_blank')).catch(() => {})}>Download</button> : null}</li>)}</ul> : <Empty t="No study material has been shared yet." />}</Card>
  </div>;
}

// ---------- Timetable ----------
export function TimetablePage() {
  return <Shell title="Timetable" sub="The weekly class schedule.">{(_k, d) => {
    const today = new Date(Date.now() + 5.5 * 3600e3).getUTCDay(); const week = d.week as any[]; const any = week.some((w) => w.periods.length);
    if (!any) return <Card><Empty t="The school has not published a timetable for this class yet." /></Card>;
    return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{week.map((w) => <Card key={w.weekday} title={w.name} right={w.weekday === today ? <Chip t="Today" c="bg-moss text-white" /> : undefined} className={w.weekday === today ? 'ring-2 ring-teal-300' : ''}>{w.periods.length ? <ul className="text-sm space-y-2">{w.periods.map((p: any, i: number) => <li key={i} className="flex gap-3"><span className="w-24 shrink-0 text-xs text-slate-500 pt-0.5">{p.start}–{p.end}</span><span><b>{p.subject}</b><div className="text-xs text-slate-500">{[p.teacher, p.room].filter(Boolean).join(' · ')}</div></span></li>)}</ul> : <Empty t="No classes." />}</Card>)}</div>;
  }}</Shell>;
}

// ---------- Fees ----------
export function FeesPage() {
  return <Shell title="Fees" sub="What is due, what you have paid, and receipts to download.">{(k, d) => <FeesBody k={k} d={d} />}</Shell>;
}
function FeesBody({ k, d }: { k: any; d: any }) {
  const f = d.fees; const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const pay = async () => {
    setMsg(''); setBusy(true);
    try {
      const r = await api('/fees/pay-link', { method: 'POST', body: JSON.stringify({ studentId: k.id }) });
      if (r?.url) { window.location.href = r.url; return; }
      // the school may use PayU instead of Razorpay
      const p = await api('/payments/fees/payu', { method: 'POST', body: JSON.stringify({ studentId: k.id, amount: f.balance }) });
      const form = document.createElement('form'); form.method = 'POST'; form.action = p.action; Object.entries(p.fields as Record<string, string>).forEach(([n, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = String(v); form.appendChild(i); }); document.body.appendChild(form); form.submit();
    } catch (e: any) { setMsg(e.message || 'Online payment is not available. Please pay at the school office.'); }
    setBusy(false);
  };
  return <div className="space-y-4">
    {f ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <Card><div className="text-xs uppercase text-slate-500">Fee plan</div><div className="font-semibold mt-1">{f.plan || '—'}</div>{f.cycle && <div className="text-xs text-slate-500">{f.cycle}</div>}</Card>
      <Card><div className="text-xs uppercase text-slate-500">Due so far</div><div className="text-2xl font-bold">{inr(f.due)}</div></Card>
      <Card><div className="text-xs uppercase text-slate-500">Paid</div><div className="text-2xl font-bold text-moss">{inr(f.paid)}</div></Card>
      <Card><div className="text-xs uppercase text-slate-500">Balance</div><div className={`text-2xl font-bold ${f.balance > 0 ? 'text-brick' : 'text-moss'}`}>{f.balance > 0 ? inr(f.balance) : 'All clear ✓'}</div></Card>
    </div> : <Card><Empty t="No fee plan has been set for this student yet." /></Card>}
    {f && f.balance > 0 && <Card><div className="flex flex-wrap items-center gap-3"><button className="btn" disabled={busy} onClick={pay}>Pay {inr(f.balance)} online</button><span className="text-sm text-slate-600">or pay at the school office</span>{msg && <span className="text-sm text-brick" role="alert">{msg}</span>}</div></Card>}
    <Card title="Payments and receipts">{d.receipts.length ? <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Date</th><th>Receipt</th><th>Mode</th><th className="text-right">Amount</th><th /></tr></thead><tbody>{d.receipts.map((r: any) => <tr key={r.id} className="border-t"><td className="py-1.5">{dlong(r.paidOn)}</td><td>{r.receiptNo || '—'}</td><td>{/^[A-Z]{2,5}$/.test(String(r.mode)) ? r.mode : String(r.mode).charAt(0) + String(r.mode).slice(1).toLowerCase()}</td><td className="text-right font-medium">{inr(r.amount)}</td><td className="text-right"><button className="underline" onClick={() => openPdf(`/fees/receipt/${r.id}.pdf`)}>PDF</button></td></tr>)}</tbody></table> : <Empty t="No payment has been recorded yet." />}</Card>
    <RecordList kind="fee-fine" child={k} title="Late fee fines" none="" pick={(r) => ({ head: r.title, meta: dshort(r.date), text: r.data.amount ? inr(r.data.amount) + (r.status === 'waived' ? ' (waived)' : '') : '' })} />
  </div>;
}

// ---------- Notices and events ----------
export function NoticesPage() {
  const [items, setItems] = useState<any[] | null>(null); const [open, setOpen] = useState<string>('');
  useEffect(() => { api('/notices').then(setItems).catch(() => setItems([])); }, []);
  const show = async (n: any) => { setOpen(open === n.id ? '' : n.id); if (!n.read) { api(`/notices/${n.id}/read`, { method: 'POST' }).catch(() => {}); setItems((l) => (l || []).map((x) => (x.id === n.id ? { ...x, read: true } : x))); } };
  return <Shell title="Notices & events" sub="Circulars from the school, holidays, events and parent-teacher meetings.">{(k, d, reload) => <div className="space-y-4">
    <Card title="Notices">{!items ? <Empty t="Loading…" /> : items.length ? <ul className="divide-y text-sm">{items.slice(0, 40).map((n) => <li key={n.id} className="py-2"><button className="w-full text-left flex justify-between gap-3" aria-expanded={open === n.id} onClick={() => show(n)}><span>{!n.read && <span className="inline-block w-2 h-2 rounded-full bg-teal-600 mr-2" aria-label="unread" />}{n.pinned && '📌 '}<b>{n.title}</b>{(n.type === 'URGENT') && <Chip t="Urgent" c="bg-brick text-white ml-2" />}{(n.type === 'HOLIDAY') && <Chip t="Holiday" c="bg-sky-200 text-sky-900 ml-2" />}</span><span className="text-xs text-slate-500 shrink-0">{dshort(n.publishedAt)}</span></button>{open === n.id && <p className="mt-1 text-slate-700 whitespace-pre-wrap">{n.body}</p>}</li>)}</ul> : <Empty t="No notices yet." />}</Card>
    <Ptm child={k} onDone={reload} />
    <RecordList kind="event" child={k} title="Events" none="No events are planned right now." future pick={(r) => ({ head: r.title, meta: [dlong(r.date), r.data.time, r.data.venue].filter(Boolean).join(' · '), text: r.data.details })} />
    <RecordList kind="holiday" child={k} title="Holidays and school calendar" none="" future limit={12} pick={(r) => ({ head: r.title, meta: `${dlong(r.date)}${r.status ? ' · ' + r.status : ''}`, text: r.data.details })} />
    <RecordList kind="gallery" child={k} title="Photos and videos" none="" limit={6} pick={(r) => ({ head: r.title, meta: dshort(r.date), text: r.data.description, link: r.data.url })} />
  </div>}</Shell>;
}
function Ptm({ child, onDone }: { child: any; onDone: () => void }) {
  const [slots, setSlots] = useState<any[] | null>(null); const [msg, setMsg] = useState('');
  const load = () => api('/records/mine/all?kind=ptm-slot').then((r) => setSlots(r)).catch(() => setSlots([]));
  useEffect(() => { load(); }, [child.id]);
  const book = async (s: any) => { setMsg(''); try { await api(`/records/ptm/${s.id}/book`, { method: 'POST', body: JSON.stringify({ studentId: child.id }) }); setMsg('Booked. The teacher has been told.'); load(); onDone(); } catch (e: any) { setMsg(e.message); load(); } };
  const today = istToday(); const open = (slots || []).filter((s) => s.status === 'open' && (!s.date || ymd(s.date) >= today)); const mine = (slots || []).filter((s) => s.status === 'booked' && s.studentId === child.id && (!s.date || ymd(s.date) >= today));
  if (!slots || (!open.length && !mine.length && !msg)) return null;
  return <Card title="Parent–teacher meeting">{msg && <p className="text-sm mb-2" role="status">{msg}</p>}
    {mine.length > 0 && <div className="mb-3 text-sm">{mine.map((s) => <div key={s.id}>✅ Booked: <b>{dlong(s.date)} {s.data.time}</b> with {s.staffName || 'the teacher'}{s.data.venue ? ` · ${s.data.venue}` : ''}{s.data.mode && s.data.mode !== 'In person' ? ` · ${s.data.mode}` : ''}</div>)}</div>}
    {open.length > 0 && <div className="grid sm:grid-cols-2 gap-2">{open.slice(0, 12).map((s) => <div key={s.id} className="border rounded-lg px-3 py-2 text-sm flex justify-between items-center gap-2"><span><b>{s.staffName || s.title}</b><div className="text-xs text-slate-500">{dlong(s.date)} · {s.data.time}{s.data.venue ? ` · ${s.data.venue}` : ''}</div></span><button className="btn" onClick={() => book(s)}>Book</button></div>)}</div>}
  </Card>;
}

// ---------- Teachers, conduct, health, requests ----------
export function MorePage() {
  return <Shell title="Teachers & school" sub="Your child's teachers, achievements, notes from the school, and requests.">{(k, d) => <MoreBody k={k} d={d} />}</Shell>;
}
function MoreBody({ k, d }: { k: any; d: any }) {
  const [fb, setFb] = useState({ staffId: '', rating: 5, comment: '' }); const [fbMsg, setFbMsg] = useState('');
  const [rq, setRq] = useState({ type: 'Certificate copy', details: '' }); const [rqMsg, setRqMsg] = useState(''); const [tick, setTick] = useState(0);
  const sendFb = async () => { setFbMsg(''); try { const t = d.teachers.find((x: any) => x.id === fb.staffId); await api('/records/feedback/teacher-feedback', { method: 'POST', body: JSON.stringify({ studentId: k.id, staffId: fb.staffId || undefined, rating: fb.rating, comment: fb.comment, subject: t?.subject || '', anonymous: false }) }); setFbMsg('Thank you. Your feedback has reached the school.'); setFb({ ...fb, comment: '' }); } catch (e: any) { setFbMsg(e.message); } };
  const sendRq = async () => { setRqMsg(''); if (!rq.details.trim()) return setRqMsg('Please write what you need.'); try { await api('/records/request', { method: 'POST', body: JSON.stringify({ studentId: k.id, title: rq.type, data: { type: rq.type, details: rq.details.trim() } }) }); setRqMsg('Sent to the school office.'); setRq({ ...rq, details: '' }); setTick(tick + 1); } catch (e: any) { setRqMsg(e.message); } };
  return <div className="space-y-4">
    <Card title="Teachers">{d.teachers.length ? <ul className="divide-y text-sm">{d.teachers.map((t: any) => <li key={t.id} className="py-1.5 flex justify-between"><b>{t.name}</b><span className="text-slate-500">{t.classTeacher ? 'Class teacher' : ''}{t.classTeacher && t.subject ? ' · ' : ''}{t.subject}</span></li>)}</ul> : <Empty t="The school has not listed the teachers for this class yet." />}</Card>
    <RecordList kind="achievement" child={k} title="Achievements and talents" none="Nothing recorded yet." pick={(r) => ({ head: r.title, meta: [r.data.area, r.data.level, r.data.position, dshort(r.date)].filter(Boolean).join(' · '), text: r.data.details })} />
    <RecordList kind="discipline" child={k} title="Notes from the school: discipline" none="" pick={(r) => ({ head: r.title, meta: [r.data.category, dshort(r.date)].filter(Boolean).join(' · '), text: [r.data.details, r.data.action && `Action: ${r.data.action}`].filter(Boolean).join(' — ') })} />
    <RecordList kind="behaviour" child={k} title="Notes from the school: behaviour" none="" pick={(r) => ({ head: r.title, meta: [r.data.type, dshort(r.date)].filter(Boolean).join(' · '), text: [r.data.details, r.data.intervention && `Support: ${r.data.intervention}`].filter(Boolean).join(' — ') })} />
    <RecordList kind="health" child={k} title="Health and medical notes" none="" pick={(r) => ({ head: r.title, meta: [r.data.type, dshort(r.date)].filter(Boolean).join(' · '), text: [r.data.details, r.data.treatment].filter(Boolean).join(' — ') })} />
    <RecordList kind="certificate" child={k} title="Certificates issued" none="" pick={(r) => ({ head: r.title, meta: [r.data.type, r.data.serial && `No. ${r.data.serial}`, dshort(r.date)].filter(Boolean).join(' · '), text: r.data.purpose })} />
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Rate a teacher or tell the school"><div className="space-y-3 text-sm">
        <label className="block">Teacher<select className="input w-full" value={fb.staffId} onChange={(e) => setFb({ ...fb, staffId: e.target.value })}><option value="">The school in general</option>{d.teachers.map((t: any) => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` (${t.subject})` : ''}</option>)}</select></label>
        <div role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={fb.rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`text-2xl ${n <= fb.rating ? 'text-amber-500' : 'text-slate-300'}`} onClick={() => setFb({ ...fb, rating: n })}>★</button>)}</div>
        <textarea className="input w-full" rows={3} maxLength={500} placeholder="Your comment (optional)" value={fb.comment} onChange={(e) => setFb({ ...fb, comment: e.target.value })} />
        <div className="flex items-center gap-3"><button className="btn" onClick={sendFb}>Send</button>{fbMsg && <span role="status" className="text-slate-600">{fbMsg}</span>}</div></div></Card>
      <Card title="Ask the school office"><div className="space-y-3 text-sm">
        <select className="input w-full" value={rq.type} onChange={(e) => setRq({ ...rq, type: e.target.value })} aria-label="Type of request">{['Certificate copy', 'Bus change', 'Change of mobile or address', 'Fee question', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
        <textarea className="input w-full" rows={3} maxLength={500} placeholder="What do you need?" value={rq.details} onChange={(e) => setRq({ ...rq, details: e.target.value })} />
        <div className="flex items-center gap-3"><button className="btn" onClick={sendRq}>Send request</button>{rqMsg && <span role="status" className="text-slate-600">{rqMsg}</span>}</div>
        <RecordList key={tick} kind="service-request" child={k} title="Your requests" none="" bare limit={5} pick={(r) => ({ head: r.title, meta: `${dshort(r.date)} · ${r.status}`, text: r.data.details })} /></div></Card>
    </div>
  </div>;
}

/** A list of the school's parent-visible records of one kind, for this child and the child's class. Renders nothing when there are none and no message is given. */
function RecordList({ kind, child, batch, title, none, pick, future, limit = 10, bare }: { kind: string; child: any; batch?: any; title: string; none: string; pick: (r: any) => { head: string; meta?: string; text?: string; link?: string }; future?: boolean; limit?: number; bare?: boolean }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { setRows(null); api('/records/mine/all?kind=' + kind).then(setRows).catch(() => setRows([])); }, [kind, child.id]);
  if (!rows) return null; const today = istToday();
  let list = rows.filter((r) => !r.studentId || r.studentId === child.id);
  if (batch) list = list.filter((r) => { const b = String(r.data?.batch || '').trim(); return !b || [batch.batch, batch.className, `${batch.className}-${batch.section}`, `${batch.className} ${batch.section}`].filter(Boolean).some((x: string) => b.toLowerCase().includes(x.toLowerCase())); });
  if (future) list = list.filter((r) => !r.date || ymd(r.date) >= today).sort((a, b) => ymd(a.date).localeCompare(ymd(b.date)));
  list = list.slice(0, limit);
  if (!list.length && !none) return null;
  const body = list.length ? <ul className="divide-y text-sm">{list.map((r) => { const p = pick(r); return <li key={r.id} className="py-2"><b>{p.head}</b>{p.meta && <div className="text-xs text-slate-500">{p.meta}</div>}{p.text && <div className="text-slate-700">{p.text}</div>}{p.link && <a className="underline text-xs" href={p.link} target="_blank" rel="noreferrer">Open</a>}</li>; })}</ul> : <Empty t={none} />;
  return bare ? <div className="border-t pt-2"><div className="text-xs uppercase text-slate-500 mb-1">{title}</div>{body}</div> : <Card title={title}>{body}</Card>;
}
