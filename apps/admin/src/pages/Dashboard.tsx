import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session } from '../api';
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');

/** Owner / staff home: numbers that matter today, what needs action, latest notices. */
export default function Dashboard() {
  const [students, setStudents] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]);
  const [fees, setFees] = useState<any>(null); const [notices, setNotices] = useState<any[]>([]); const [wb, setWb] = useState<any>(null); const [sub, setSub] = useState<any>(null);
  const [att, setAtt] = useState<any[]>([]); const [doubts, setDoubts] = useState<any[]>([]); const [leaves, setLeaves] = useState<any[]>([]); const [enq, setEnq] = useState<any[]>([]); const [hw, setHw] = useState<any[]>([]);
  const u = session.user; const can = (m: string) => u?.role === 'ADMIN' || u?.role === 'SUPER_ADMIN' || (u?.modules || []).includes(m);
  useEffect(() => {
    if (u?.role === 'SUPER_ADMIN' && !session.viewCentre) return; /* platform view: no centre chosen yet, nothing to load */
    const q = (p: string, set: (v: any) => void) => api(p).then(set).catch(() => {});
    q('/students', setStudents); q('/batches', setBatches); q('/notices', setNotices); q('/wellbeing/summary', setWb);
    if (can('fees')) q('/fees/summary', setFees); if (can('attendance')) q('/attendance/summary', setAtt); if (can('doubts')) q('/doubts', setDoubts); if (can('leaves')) q('/leaves', setLeaves); if (can('enquiries')) q('/enquiries', setEnq); if (can('homework')) q('/homework', setHw);
    if (u?.role === 'ADMIN') q('/subscription', setSub);
  }, []);
  const active = students.filter((s) => s.active !== false).length;
  const today = new Date().toISOString().slice(0, 10);
  const presentToday = att.filter((a) => a.today === 'PRESENT' || a.today === 'LATE').length;
  const avgPct = att.length ? Math.round(att.reduce((s, a) => s + (Number(a.pct) || 0), 0) / att.length) : null;
  const low = att.filter((a) => Number(a.pct) < 75 && a.total > 0);
  const openDoubts = doubts.filter((d) => d.status !== 'resolved'); const pendingLeaves = leaves.filter((l) => l.status === 'pending');
  const followUps = enq.filter((e) => e.nextFollowUp && e.nextFollowUp.slice(0, 10) <= today && !['admitted', 'lost'].includes(e.status));
  const dueHw = hw.filter((h) => h.dueAt && h.dueAt.slice(0, 10) <= today);
  const birthdays = students.filter((s) => s.dob && s.dob.slice(5, 10) === today.slice(5, 10));
  return (
    <div>
      {u?.subscriptionStatus && ['grace', 'suspended', 'trial'].includes(u.subscriptionStatus) && (
        <div className={`card p-3 mb-4 text-sm ${u.subscriptionStatus === 'suspended' ? 'border-brick' : 'border-marigold-500 bg-marigold-100'}`}>
          {u.subscriptionStatus === 'suspended' ? 'Your subscription is suspended — the centre is read-only until renewed. ' : u.subscriptionStatus === 'grace' ? 'Your subscription has expired — renew within the grace period to avoid suspension. ' : 'You are on a free trial. '}
          <Link className="underline font-semibold" to="/subscription">Subscription</Link>
        </div>
      )}
      {sub && !sub.smtpUser && <div className="card p-3 mb-4 text-sm border-marigold-500 bg-marigold-100">Connect your coaching’s Gmail so OTPs, notices and receipts go out in your name — <Link className="underline font-semibold" to="/subscription">Subscription & settings → Your coaching’s email</Link></div>}
      <h1 className="text-2xl font-bold">Today</h1>
      <ClockCard />
      {['ADMIN', 'SUPER_ADMIN', 'STAFF'].includes(u?.role || '') && <AlertsWidget />}
      <div className="grid grid-cols-4 gap-4 mt-6">
        <Stat label="Active students" value={active} note={`${batches.length} batch${batches.length === 1 ? '' : 'es'}`} to="/students" />
        {can('attendance') && <Stat label="Attendance" value={avgPct === null ? '—' : `${avgPct}%`} note={`${presentToday} present today · ${low.length} below 75%`} to="/attendance" />}
        {can('fees') && <Stat label="Collected this month" value={fees ? inr(fees.collectedThisMonth) : '—'} note={fees ? `${inr(fees.collectedTotal)} all time` : ''} to="/fees" />}
        {can('fees') && <Stat label="Outstanding" value={fees ? inr(fees.outstanding) : '—'} note="fees due" to="/fees" />}
      </div>
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="card p-4 col-span-1"><h2 className="font-semibold mb-2">Needs action</h2>
          <ul className="text-sm space-y-2">
            {can('doubts') && <li><Link className="underline" to="/inbox">{`${openDoubts.length} open doubt${openDoubts.length === 1 ? '' : 's'}`}</Link>{openDoubts.some((d) => d.overdue) && <span className="text-brick"> · some over 24 h</span>}</li>}
            {can('leaves') && <li><Link className="underline" to="/inbox">{`${pendingLeaves.length} leave request${pendingLeaves.length === 1 ? '' : 's'} pending`}</Link></li>}
            {can('enquiries') && <li><Link className="underline" to="/enquiries">{`${followUps.length} enquiry follow-up${followUps.length === 1 ? '' : 's'} due`}</Link></li>}
            {can('homework') && <li><Link className="underline" to="/homework">{`${dueHw.length} homework due / overdue`}</Link></li>}
            {birthdays.length > 0 && <li>🎂 Birthday today: {birthdays.map((b) => b.name).join(', ')}</li>}
            {low.length > 0 && <li className="text-brick">Below 75%: {low.slice(0, 4).map((a) => a.name).join(', ')}{low.length > 4 ? ` +${low.length - 4}` : ''}</li>}
          </ul>
        </div>
        <div className="card p-4 col-span-2"><div className="flex justify-between items-center mb-2"><h2 className="font-semibold">Latest notices</h2>{can('notices') && <Link className="text-sm underline" to="/notices">All notices</Link>}</div>
          {notices.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : <ul className="text-sm divide-y divide-slate-100">{notices.slice(0, 5).map((n) => <li key={n.id} className="py-2 flex justify-between gap-3"><span>{n.pinned && '📌 '}<b>{n.title}</b> <span className="text-slate-600">— {String(n.body || '').slice(0, 80)}</span></span><span className="text-xs text-slate-500 whitespace-nowrap">{new Date(n.publishedAt).toLocaleDateString('en-IN')}</span></li>)}</ul>}
        </div>
      </div>
      {wb && wb.total > 0 && <div className="card mt-6 p-4"><b>Wellbeing & counselling</b> <span className="text-sm text-slate-600">— {wb.total} requests from your students/parents · {wb.byStatus.closed || 0} closed · {Object.entries(wb.byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}</span><p className="text-xs text-slate-500 mt-1">{wb.note}</p></div>}
      {students.length === 0 && <div className="card mt-8 p-6"><p className="font-semibold">No students yet.</p><p className="text-slate-600 text-sm mt-1">Add your first batch, then add students to it. Parents get their login the moment a student is added.</p></div>}
    </div>
  );
}
function Stat({ label, value, note, to }: { label: string; value: string | number; note?: string; to?: string }) {
  const inner = <><div className="text-sm text-slate-600">{label}</div><div className="text-3xl font-bold mt-1">{value}</div>{note && <div className="text-xs text-slate-500 mt-1">{note}</div>}</>;
  return to ? <Link to={to} className="card p-5 block hover:border-edge-500">{inner}</Link> : <div className="card p-5">{inner}</div>;
}

const TZ = 'Asia/Kolkata';
/** Live clock, today's day and date, and a small calendar of this month with today highlighted (Indian time). */
function ClockCard() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const weekday = now.toLocaleDateString('en-IN', { timeZone: TZ, weekday: 'long' });
  const weekdayHi = now.toLocaleDateString('hi-IN', { timeZone: TZ, weekday: 'long' });
  const date = now.toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-').map(Number);
  const offset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return (
    <div className="card mt-3 p-5 flex items-center justify-between gap-8 flex-wrap" data-testid="clock-card">
      <div>
        <div className="text-5xl font-bold tabular-nums text-edge-600" aria-label="Current time">{time}</div>
        <div className="text-2xl font-semibold mt-2">{weekday} <span className="text-base font-normal text-slate-500">· {weekdayHi}</span></div>
        <div className="text-slate-600 mt-0.5">{date}</div>
      </div>
      <div className="w-64">
        <div className="text-sm font-semibold text-slate-700 mb-1">{monthName}</div>
        <div className="grid grid-cols-7 text-center text-[11px] text-slate-400">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x, i) => <div key={i}>{x}</div>)}</div>
        <div className="grid grid-cols-7 text-center text-sm gap-y-0.5 mt-0.5">{cells.map((c, i) => <div key={i} className={c === d ? 'bg-edge-500 text-white rounded-full font-bold' : c && (i % 7 === 0) ? 'text-brick' : 'text-slate-700'}>{c ?? ''}</div>)}</div>
      </div>
    </div>
  );
}

/** Top alerts for today with a link to the full alert centre. */
function AlertsWidget() {
  const [d, setD] = useState<any>(null); useEffect(() => { if (session.user?.role === 'SUPER_ADMIN' && !session.viewCentre) return; api('/alerts').then(setD).catch(() => {}); }, []);
  if (!d || !d.alerts.length) return null; const top = d.alerts.filter((a: any) => a.severity !== 'info').slice(0, 4);
  return (
    <div className="card mt-4 p-4" data-testid="alerts-widget"><div className="flex items-center justify-between mb-2"><b>Needs your attention</b><Link to="/alerts" className="text-sm text-edge-600 underline">All alerts ({d.alerts.length})</Link></div>
      <div className="grid grid-cols-4 gap-3">{top.map((a: any) => <Link key={a.key} to={a.path} className={`rounded border-l-4 p-3 bg-slate-50 hover:bg-slate-100 ${a.severity === 'high' ? 'border-brick' : 'border-marigold-500'}`}><div className="text-2xl font-bold leading-none">{a.count}</div><div className="text-sm mt-1">{a.label}</div></Link>)}</div></div>
  );
}
