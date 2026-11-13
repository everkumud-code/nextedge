import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const dshort = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const hr = () => { const h = new Date(Date.now() + 5.5 * 3600e3).getUTCHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const nowHM = () => { const d = new Date(Date.now() + 5.5 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const ST_COLOUR: Record<string, string> = { PRESENT: '#2E7D32', LATE: '#F9A825', ABSENT: '#C62828', LEAVE: '#90A4AE' };

// ---------- small building blocks (kept outside the screens so typing and state never reset) ----------
function Ring({ value, label, sub, color = '#0F766E', size = 92 }: { value: number | null; label?: string; sub?: string; color?: string; size?: number }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r, v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return <div className="text-center"><div className="relative inline-block" style={{ width: size, height: size }}><svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,120,120,.18)" strokeWidth="9" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} /></svg><div className="absolute inset-0 grid place-items-center text-xl font-bold">{value === null ? '—' : `${value}%`}</div></div>{label && <div className="text-sm font-medium mt-1">{label}</div>}{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>;
}
function Tile({ label, value, note, tone, to }: { label: string; value: any; note?: string; tone?: 'good' | 'warn' | 'bad'; to?: string }) {
  const col = tone === 'bad' ? 'text-brick' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-moss' : '';
  const body = <div className="card p-4 h-full hover:shadow-md transition"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div><div className={`text-3xl font-bold mt-1 ${col}`}>{value}</div>{note && <div className="text-xs text-slate-500 mt-1">{note}</div>}</div>;
  return to ? <Link to={to}>{body}</Link> : body;
}
function Card({ title, link, to, children, className = '' }: { title: string; link?: string; to?: string; children: any; className?: string }) {
  return <div className={`card p-4 ${className}`}><div className="flex justify-between items-center mb-2"><h2 className="font-semibold">{title}</h2>{to && <Link className="text-sm underline" to={to}>{link || 'Open'}</Link>}</div>{children}</div>;
}
function Bars({ data, colour = '#0F766E', fmt = (n: number) => String(n) }: { data: { label: string; value: number }[]; colour?: string; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return <div className="flex items-end gap-2 h-32">{data.map((d, i) => <div key={i} className="flex-1 flex flex-col items-center justify-end h-full"><div className="text-[10px] text-slate-500">{fmt(d.value)}</div><div className="w-full rounded-t" style={{ height: `${Math.max(3, (d.value / max) * 100)}%`, background: colour }} /><div className="text-[10px] text-slate-500 mt-1 truncate w-full text-center">{d.label}</div></div>)}</div>;
}
const Empty = ({ t }: { t: string }) => <p className="text-sm text-slate-500">{t}</p>;
const Chip = ({ t, c }: { t: string; c: string }) => <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 self-start whitespace-nowrap ${c}`}>{t}</span>;
const Hero = ({ title, sub, right, bg = 'linear-gradient(135deg,#0F766E,#134E4A)' }: { title: string; sub?: any; right?: any; bg?: string }) => <div className="rounded-xl p-5 text-white flex items-center justify-between gap-4 flex-wrap" style={{ background: bg }}><div><div className="text-2xl font-bold">{title}</div>{sub && <div className="text-sm opacity-90 mt-1">{sub}</div>}</div>{right}</div>;
const Notices = ({ items }: { items: any[] }) => <Card title="Latest notices" to="/notices">{items?.length ? <ul className="text-sm divide-y divide-slate-100">{items.map((n) => <li key={n.id} className="py-2"><b>{n.pinned && '📌 '}{n.title}</b> <span className="text-slate-600">— {String(n.body || '').slice(0, 110)}</span></li>)}</ul> : <Empty t="No notices yet." />}</Card>;
const Duties = ({ items }: { items: any[] }) => <Card title="My duties" to="/records/duty">{items?.length ? <ul className="text-sm space-y-2">{items.map((d) => <li key={d.id} className="flex justify-between gap-2"><span><b>{d.title}</b>{d.priority !== 'Normal' && <Chip t={d.priority} c="bg-brick text-white ml-2" />}</span><span className="text-slate-500">{d.dueDate ? `due ${dshort(d.dueDate)}` : d.status}</span></li>)}</ul> : <Empty t="Nothing assigned to you." />}</Card>;
const MyMonth = ({ me }: { me: any }) => me ? <Card title="My attendance this month" to="/staff-attendance"><div className="flex items-center gap-4"><Ring value={me.marked ? Math.round(((me.present + me.late + me.halfDay * 0.5) / me.marked) * 100) : null} /><div className="text-sm space-y-0.5"><div>Present <b>{me.present}</b> · Late <b>{me.late}</b></div><div>Half day <b>{me.halfDay}</b> · Absent <b>{me.absent}</b></div><div>Leave <b>{me.leave}</b></div><div className="text-slate-500">Today: {me.todayStatus || 'not marked yet'}</div></div></div></Card> : null;
const Funnel = ({ items }: { items: { label: string; value: number; color: string }[] }) => { const max = Math.max(1, ...items.map((i) => i.value)); return <div className="space-y-1.5">{items.map((i) => <div key={i.label} className="flex items-center gap-2 text-sm"><span className="w-28 text-slate-600">{i.label}</span><div className="flex-1 h-4 bg-slate-100 rounded"><div className="h-4 rounded" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: i.color }} /></div><b className="w-8 text-right">{i.value}</b></div>)}</div>; };

// ---------- student / parent ----------
function Child({ c, parent }: { c: any; parent: boolean }) {
  const a = c.attendance; const hw = c.homework || []; const pending = hw.filter((h: any) => !h.done); const overdue = pending.filter((h: any) => h.overdue).length; const col = c.house?.colour || '#0F766E'; const now = nowHM();
  return (
    <div className="space-y-4">
      <Hero bg={`linear-gradient(135deg, ${col}, #0f172a)`} title={`${hr()}, ${c.name.split(' ')[0]}!`}
        sub={<>{[c.className, c.section && `Section ${c.section}`, c.rollNo && `Roll ${c.rollNo}`].filter(Boolean).join(' · ')}{c.house && <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-xs font-semibold">{c.house.name} House</span>}{c.house?.roles?.map((r: string) => <span key={r} className="ml-1 px-2 py-0.5 rounded-full bg-amber-300 text-slate-900 text-xs font-semibold">{r}</span>)}</>}
        right={<div className="flex gap-4 items-center">{c.birthday && c.birthday.daysLeft <= 7 && <div className="text-center bg-white/15 rounded-lg px-3 py-2">🎂<div className="text-xs">{c.birthday.daysLeft === 0 ? `Happy ${c.birthday.age}th birthday!` : `Birthday in ${c.birthday.daysLeft} day${c.birthday.daysLeft === 1 ? '' : 's'}`}</div></div>}<div className="bg-white/95 text-slate-900 rounded-lg p-2"><Ring value={a.monthPct} label="Attendance" sub="this month" color={a.monthPct !== null && a.monthPct < 75 ? '#C62828' : '#2E7D32'} size={84} /></div></div>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Day streak" value={`🔥 ${a.streak}`} note={a.streak ? 'days present in a row' : 'start a new streak today'} tone={a.streak >= 5 ? 'good' : undefined} />
        <Tile label="Homework pending" value={pending.length} note={overdue ? `${overdue} overdue` : 'all on time'} tone={overdue ? 'bad' : pending.length ? 'warn' : 'good'} to="/homework" />
        <Tile label="Fees" value={c.fees ? (c.fees.balance > 0 ? inr(c.fees.balance) : 'All clear ✓') : '—'} note={c.fees ? (c.fees.balance > 0 ? 'balance due' : `${inr(c.fees.paid)} paid`) : 'no fee plan'} tone={c.fees ? (c.fees.balance > 0 ? 'warn' : 'good') : undefined} to="/fees" />
        <Tile label="Overall attendance" value={a.overallPct === null ? '—' : `${a.overallPct}%`} note={`${a.present} present · ${a.absent} absent this month`} tone={a.overallPct !== null && a.overallPct < 75 ? 'bad' : undefined} to="/attendance" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Today's classes" to="/timetable" >{c.periods.length ? <ul className="text-sm space-y-2">{c.periods.map((p: any, i: number) => { const live = now >= p.start && now < p.end; return <li key={i} className={`flex gap-3 items-start rounded-md px-2 py-1 ${live ? 'bg-teal-50 ring-1 ring-teal-300' : ''}`}><span className="w-24 shrink-0 text-xs text-slate-500 pt-0.5">{p.start}–{p.end}</span><span><b>{p.subject}</b>{live && <Chip t="Now" c="bg-moss text-white ml-2" />}<div className="text-xs text-slate-500">{p.teacher || ''}{p.room ? ` · ${p.room}` : ''}</div></span></li>; })}</ul> : <Empty t="No classes scheduled today." />}</Card>
        <Card title="Last 3 weeks" to="/attendance" >{a.strip.length ? <><div className="flex flex-wrap gap-1.5">{a.strip.map((d: any, i: number) => <div key={i} title={`${dshort(d.date)} · ${d.status}`} className="w-6 h-6 rounded" style={{ background: ST_COLOUR[d.status] || '#CBD5E1' }} />)}</div><div className="flex gap-3 text-xs text-slate-500 mt-3"><span><i className="inline-block w-2.5 h-2.5 rounded mr-1" style={{ background: ST_COLOUR.PRESENT }} />Present</span><span><i className="inline-block w-2.5 h-2.5 rounded mr-1" style={{ background: ST_COLOUR.LATE }} />Late</span><span><i className="inline-block w-2.5 h-2.5 rounded mr-1" style={{ background: ST_COLOUR.ABSENT }} />Absent</span><span><i className="inline-block w-2.5 h-2.5 rounded mr-1" style={{ background: ST_COLOUR.LEAVE }} />Leave</span></div></> : <Empty t="Attendance will appear here." />}</Card>
        <Card title="Homework" to="/homework" >{hw.length ? <ul className="text-sm space-y-2">{hw.slice(0, 5).map((h: any) => <li key={h.id} className="flex justify-between gap-2"><span><b>{h.title}</b><div className="text-xs text-slate-500">{h.subject || ''} · due {dshort(h.dueAt)}</div></span>{h.done ? <Chip t="Done" c="bg-moss text-white" /> : h.overdue ? <Chip t="Overdue" c="bg-brick text-white" /> : <Chip t="Pending" c="bg-marigold-500" />}</li>)}</ul> : <Empty t="No homework right now." />}</Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Exams & results" to="/exams">{c.exams.results.length ? <><Bars data={c.exams.results.map((r: any) => ({ label: r.name.slice(0, 8), value: r.pct }))} colour={col} fmt={(n) => `${n}%`} /><div className="text-xs text-slate-500 mt-2">Percentage in each exam</div></> : <Empty t="Results will appear after the exams are published." />}{c.exams.upcoming.length > 0 && <div className="mt-3 pt-3 border-t text-sm"><div className="font-medium">Coming up</div>{c.exams.upcoming.map((e: any) => <div key={e.id} className="flex justify-between"><span>{e.name}</span><span className="text-slate-500">{dshort(e.date)}</span></div>)}</div>}</Card>
        <Card title={c.house ? `${c.house.name} House` : 'House'}>{c.house ? <div><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-full grid place-items-center text-white text-lg font-bold" style={{ background: c.house.colour }}>#{c.house.rank}</div><div><div className="font-semibold">{c.house.points} points</div><div className="text-xs text-slate-500">rank {c.house.rank} of {c.house.of}{c.house.myPoints ? ` · you earned ${c.house.myPoints}` : ''}</div></div></div>{c.house.motto && <div className="text-xs italic text-slate-500 mt-2">“{c.house.motto}”</div>}<div className="mt-3 space-y-1">{c.house.board.map((b: any) => <div key={b.name} className="flex items-center gap-2 text-xs"><span className="w-16 truncate">{b.name}</span><div className="flex-1 h-2.5 bg-slate-100 rounded"><div className="h-2.5 rounded" style={{ width: `${Math.max(3, (Math.max(0, b.points) / Math.max(1, c.house.board[0].points)) * 100)}%`, background: b.colour }} /></div><b>{b.points}</b></div>)}</div></div> : <Empty t="Not in a house yet." />}</Card>
        <Card title="Library, bus & wins"><div className="text-sm space-y-3">
          <div><div className="font-medium">Books issued</div>{c.loans.length ? c.loans.map((l: any, i: number) => <div key={i} className="flex justify-between"><span>{l.book}</span><span className={l.overdue ? 'text-brick font-medium' : 'text-slate-500'}>{l.overdue ? 'overdue' : `due ${dshort(l.dueDate)}`}</span></div>) : <span className="text-slate-500">None</span>}</div>
          <div><div className="font-medium">School bus</div>{c.bus ? <div className="text-slate-600">{c.bus.route}<div className="text-xs">Stop: {c.bus.stop}{c.bus.pickup ? ` · pickup ${c.bus.pickup}` : ''}{c.bus.driver ? ` · ${c.bus.driver}` : ''}</div></div> : <span className="text-slate-500">Not using the bus</span>}</div>
          <div><div className="font-medium">Achievements</div>{c.achievements.length ? c.achievements.map((w: any, i: number) => <div key={i}>🏅 {w.title}{w.position ? ` — ${w.position}` : ''}</div>) : <span className="text-slate-500">Nothing recorded yet</span>}</div>
        </div></Card>
      </div>
    </div>
  );
}
function Family({ d }: { d: any }) {
  const [i, setI] = useState(0); const kids: any[] = d.children || []; if (!kids.length) return <p className="text-slate-500">No student is linked to this login yet.</p>; const c = kids[Math.min(i, kids.length - 1)];
  return <div className="space-y-4">{kids.length > 1 && <div className="flex gap-2">{kids.map((k, j) => <button key={k.id} className={j === i ? 'btn' : 'btn-quiet'} onClick={() => setI(j)}>{k.name}</button>)}</div>}<Child c={c} parent={d.kind === 'parent'} /><Notices items={d.notices} /></div>;
}

// ---------- teacher ----------
function Teacher({ d }: { d: any }) {
  const now = nowHM();
  return <div className="space-y-4">
    <Hero title={`${hr()}, ${String(d.name).split(' ').slice(0, 2).join(' ')}`} sub={`${d.periods.length} period${d.periods.length === 1 ? '' : 's'} today · ${d.classes.length} class${d.classes.length === 1 ? '' : 'es'}${d.title ? ' · ' + d.title : ''}`} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Tile label="Periods today" value={d.periods.length} note={d.periods.filter((p: any) => p.substitute).length ? `${d.periods.filter((p: any) => p.substitute).length} substitution` : 'as per timetable'} to="/timetable" />
      <Tile label="Attendance to mark" value={d.attendanceDue.length} note={d.attendanceDue.length ? d.attendanceDue.map((x: any) => x.name).join(', ') : 'all marked ✓'} tone={d.attendanceDue.length ? 'bad' : 'good'} to="/attendance" />
      <Tile label="Homework to check" value={d.toCheck} note="submissions waiting" tone={d.toCheck ? 'warn' : 'good'} to="/homework" />
      <Tile label="Leave requests" value={d.pendingLeaves} note="from your class" tone={d.pendingLeaves ? 'warn' : undefined} to="/inbox" />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Today's periods" to="/timetable" className="lg:col-span-2">{d.periods.length ? <ul className="text-sm space-y-2">{d.periods.map((p: any, i: number) => { const live = now >= p.start && now < p.end; const done = now >= p.end; return <li key={i} className={`flex items-center gap-3 rounded-md px-3 py-2 ${live ? 'bg-teal-50 ring-1 ring-teal-300' : done ? 'opacity-50' : 'bg-slate-50'}`}><span className="w-28 text-xs text-slate-500">{p.start}–{p.end}</span><span className="flex-1"><b>{p.subject}</b> · {p.batch}{p.room ? ` · ${p.room}` : ''}</span>{p.substitute && <Chip t="Substitution" c="bg-marigold-500" />}{live && <Chip t="Now" c="bg-moss text-white" />}</li>; })}</ul> : <Empty t="You have no periods today." />}</Card>
      <Card title="Live classes today" to="/live">{d.live.length ? <ul className="text-sm space-y-2">{d.live.map((l: any) => <li key={l.id} className="flex justify-between"><span><b>{l.title}</b><div className="text-xs text-slate-500">{new Date(l.startAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></span><Chip t={l.status} c={l.status === 'live' ? 'bg-moss text-white' : 'bg-slate-200'} /></li>)}</ul> : <Empty t="No live class today." />}</Card>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="My classes" to="/batches" className="lg:col-span-2">{d.classes.length ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{d.classes.map((c: any) => <div key={c.id} className="border rounded-lg p-3"><div className="font-semibold">{c.name}</div><div className="text-xs text-slate-500">{c.subject || (c.classTeacher ? 'Class teacher' : '')}{c.subject && c.classTeacher ? ' · Class teacher' : ''}</div><div className="text-2xl font-bold mt-1">{c.strength}<span className="text-xs font-normal text-slate-500"> students</span></div></div>)}</div> : <Empty t="No class is assigned to you yet." />}</Card>
      <div className="space-y-4"><Duties items={d.duties} /><MyMonth me={d.me} /></div>
    </div>
    <Notices items={d.notices} />
  </div>;
}

// ---------- driver ----------
function Driver({ d }: { d: any }) {
  const kids = d.routes.reduce((a: number, r: any) => a + r.students, 0);
  return <div className="space-y-4">
    <Hero bg="linear-gradient(135deg,#EF6C00,#7c2d12)" title={`${hr()}, ${String(d.name).split(' ')[0]}`} sub={d.routes.length ? `${d.routes.length} route${d.routes.length === 1 ? '' : 's'} · ${kids} students on your bus` : 'No route is assigned to you yet'} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Tile label="Routes" value={d.routes.length} /><Tile label="Students on board" value={kids} note={d.routes[0]?.capacity ? `bus capacity ${d.routes[0].capacity}` : ''} /><Tile label="Stops" value={d.routes.reduce((a: number, r: any) => a + r.stops.length, 0)} /><Tile label="Today" value={d.me?.todayStatus || 'not marked'} note="your attendance" /></div>
    {d.routes.map((r: any) => <Card key={r.id} title={`${r.title}`} to="/records/transport-route"><div className="text-sm text-slate-600 mb-3">{[r.vehicle && `Vehicle ${r.vehicle}`, r.helper && `Helper ${r.helper}`, `${r.students} students`].filter(Boolean).join(' · ')}</div>
      <ol className="relative border-l-2 border-orange-300 ml-3 space-y-3">{r.stops.map((s: any, i: number) => <li key={i} className="ml-5"><span className="absolute -left-[9px] w-4 h-4 rounded-full bg-orange-500 border-2 border-white" /><div className="flex justify-between"><b>{s.line}</b><span className="text-sm text-slate-500">{s.kids.length} student{s.kids.length === 1 ? '' : 's'}</span></div>{s.kids.length > 0 && <div className="text-xs text-slate-500">{s.kids.map((k: any) => `${k.name}${k.cls ? ` (${k.cls})` : ''}`).join(', ')}</div>}</li>)}</ol></Card>)}
    {!d.routes.length && <Card title="Your route"><Empty t="Ask the school office to put your name or mobile number on a route (Transport → Routes → Driver)." /></Card>}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><MyMonth me={d.me} /><Duties items={d.duties} /></div><Notices items={d.notices} />
  </div>;
}

// ---------- front office ----------
function FrontOffice({ d }: { d: any }) {
  const inside = d.visitors.filter((v: any) => v.status === 'in').length; const f = d.enquiries.funnel; const adm = d.admissions || {};
  return <div className="space-y-4">
    <Hero bg="linear-gradient(135deg,#1565C0,#0f172a)" title={`${hr()}, ${String(d.name).split(' ')[0]}`} sub="Front office · gate, enquiries and admissions" />
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"><Tile label="Visitors today" value={d.visitors.length} to="/records/visitor" /><Tile label="Inside now" value={inside} tone={inside ? 'warn' : undefined} note="not yet signed out" to="/records/visitor" /><Tile label="Follow-ups due" value={d.enquiries.dueCount} tone={d.enquiries.dueCount ? 'bad' : 'good'} to="/enquiries" /><Tile label="New enquiries (7 days)" value={d.enquiries.newThisWeek} to="/enquiries" /><Tile label="Applications to handle" value={(adm.new || 0) + (adm['documents-pending'] || 0) + (adm.interview || 0)} note={`${adm.admitted || 0} admitted`} to="/records/admission" /></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Gate register — today" to="/records/visitor" className="lg:col-span-2">{d.visitors.length ? <table className="w-full text-sm"><thead><tr><th className="th">Visitor</th><th className="th">Purpose</th><th className="th">To meet</th><th className="th">In</th><th className="th">Out</th></tr></thead><tbody>{d.visitors.slice(0, 10).map((v: any) => <tr key={v.id}><td className="td">{v.name}</td><td className="td">{v.purpose}</td><td className="td">{v.toMeet}</td><td className="td">{v.inTime}</td><td className="td">{v.status === 'in' ? <Chip t="inside" c="bg-marigold-500" /> : v.outTime}</td></tr>)}</tbody></table> : <Empty t="No visitor has been entered today." />}</Card>
      <Card title="Call these today" to="/enquiries">{d.enquiries.followUps.length ? <ul className="text-sm space-y-2">{d.enquiries.followUps.map((e: any) => <li key={e.id} className="flex justify-between gap-2"><span><b>{e.name}</b><div className="text-xs text-slate-500">{e.className || ''} · {e.mobile}</div></span><span className="text-xs text-brick">{dshort(e.due)}</span></li>)}</ul> : <Empty t="No follow-up is due. 🎉" />}</Card>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Enquiry funnel" to="/enquiries"><Funnel items={[{ label: 'New', value: f.new, color: '#1565C0' }, { label: 'Contacted', value: f.contacted, color: '#00838F' }, { label: 'Demo / visit', value: f.demo, color: '#F9A825' }, { label: 'Admitted', value: f.admitted, color: '#2E7D32' }, { label: 'Lost', value: f.lost, color: '#90A4AE' }]} /></Card>
      <Card title="Admission applications" to="/records/admission"><Funnel items={[{ label: 'New', value: adm.new || 0, color: '#1565C0' }, { label: 'Documents', value: adm['documents-pending'] || 0, color: '#F9A825' }, { label: 'Interview', value: adm.interview || 0, color: '#6A1B9A' }, { label: 'Approved', value: adm.approved || 0, color: '#00838F' }, { label: 'Admitted', value: adm.admitted || 0, color: '#2E7D32' }]} /></Card>
      <Card title="Requests to handle" to="/records/service-request">{d.requests.length ? <ul className="text-sm space-y-2">{d.requests.map((r: any) => <li key={r.id} className="flex justify-between gap-2"><span><b>{r.title}</b><div className="text-xs text-slate-500">{r.type}</div></span><Chip t={r.status} c="bg-slate-200" /></li>)}</ul> : <Empty t="No open request." />}</Card>
    </div>
    <Notices items={d.notices} />
  </div>;
}

// ---------- HR ----------
function HR({ d }: { d: any }) {
  const att = d.headcount ? Math.round((d.here / d.headcount) * 100) : null; const cand = d.openings.candidates || {};
  return <div className="space-y-4">
    <Hero bg="linear-gradient(135deg,#6A1B9A,#1e1b4b)" title={`${hr()}, ${String(d.name).split(' ')[0]}`} sub="Human resources · people, leave, hiring and payroll" right={<div className="bg-white/95 text-slate-900 rounded-lg p-2"><Ring value={att} label="In today" size={84} color="#6A1B9A" /></div>} />
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"><Tile label="Staff" value={d.headcount} note={`${d.employees.active} in HR records`} to="/records/employee" /><Tile label="Present today" value={d.here} tone="good" to="/staff-attendance" /><Tile label="On leave" value={d.onLeave} to="/records/staff-leave" /><Tile label="Not marked" value={d.notMarked} tone={d.notMarked ? 'warn' : 'good'} to="/staff-attendance" /><Tile label="Leave to approve" value={d.leaves.length} tone={d.leaves.length ? 'bad' : 'good'} to="/records/staff-leave" /></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Leave waiting for you" to="/records/staff-leave" className="lg:col-span-2">{d.leaves.length ? <table className="w-full text-sm"><thead><tr><th className="th">Staff</th><th className="th">Reason</th><th className="th">From</th><th className="th">To</th><th className="th">Days</th></tr></thead><tbody>{d.leaves.map((l: any) => <tr key={l.id}><td className="td"><b>{l.name}</b><div className="text-xs text-slate-500">{l.type}</div></td><td className="td">{l.reason}</td><td className="td">{dshort(l.from)}</td><td className="td">{dshort(l.to)}</td><td className="td">{l.days}</td></tr>)}</tbody></table> : <Empty t="No leave request is waiting. 🎉" />}</Card>
      <Card title="Payroll this month" to="/payroll"><div className="text-sm space-y-2"><div className="flex justify-between"><span>Payslips to pay</span><b>{d.payroll.draft}</b></div><div className="flex justify-between"><span>Amount to pay</span><b>{inr(d.payroll.net)}</b></div><div className="flex justify-between"><span>Already paid</span><b className="text-moss">{d.payroll.paid}</b></div></div></Card>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Hiring" to="/records/job-opening">{d.openings.open.length ? <><ul className="text-sm space-y-1">{d.openings.open.map((o: any, i: number) => <li key={i} className="flex justify-between"><span><b>{o.title}</b></span><span className="text-slate-500">{o.vacancies} post{Number(o.vacancies) === 1 ? '' : 's'}{o.lastDate ? ` · till ${dshort(o.lastDate)}` : ''}</span></li>)}</ul><div className="mt-3"><Funnel items={[{ label: 'Applied', value: cand.applied || 0, color: '#1565C0' }, { label: 'Shortlisted', value: cand.shortlisted || 0, color: '#00838F' }, { label: 'Interview', value: cand.interview || 0, color: '#F9A825' }, { label: 'Offered', value: cand.offered || 0, color: '#6A1B9A' }, { label: 'Joined', value: cand.joined || 0, color: '#2E7D32' }]} /></div></> : <Empty t="No opening is advertised." />}</Card>
      <Card title="People by department" to="/records/employee">{Object.keys(d.employees.dept).length ? <Funnel items={Object.entries(d.employees.dept).map(([k, v]) => ({ label: k, value: v as number, color: '#6A1B9A' }))} /> : <Empty t="Add employees in the HR records." />}</Card>
      <Card title="Work anniversaries today">{d.employees.anniversaries.length ? d.employees.anniversaries.map((a: any) => <div key={a.name} className="text-sm">🎉 <b>{a.name}</b> — {a.years} year{a.years === 1 ? '' : 's'} with us</div>) : <Empty t="None today." />}</Card>
    </div>
    <Notices items={d.notices} />
  </div>;
}

// ---------- accounts ----------
function Accounts({ d }: { d: any }) {
  return <div className="space-y-4">
    <Hero bg="linear-gradient(135deg,#2E7D32,#052e16)" title={`${hr()}, ${String(d.name).split(' ')[0]}`} sub="Accounts · fee collection, dues and payroll" right={<div className="text-right"><div className="text-xs opacity-80">Collected today</div><div className="text-3xl font-bold">{inr(d.collected.today)}</div></div>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4"><Tile label="This month" value={inr(d.collected.month)} tone="good" to="/fees" /><Tile label="This session" value={inr(d.collected.year)} note="since 1 April" to="/fees" /><Tile label="Outstanding" value={inr(d.outstanding)} note={`${d.defaulterCount} students`} tone={d.outstanding ? 'bad' : 'good'} to="/fees" /><Tile label="Payroll to pay" value={inr(d.payroll.net)} note={`${d.payroll.draft} payslips`} to="/payroll" /></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Collection, last 6 months" to="/fees" className="lg:col-span-2"><Bars data={d.trend.map((t: any) => ({ label: t.month.slice(5) + '/' + t.month.slice(2, 4), value: t.amount }))} colour="#2E7D32" fmt={(n) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))} /></Card>
      <Card title="How they paid this month">{d.modes.length ? <ul className="text-sm space-y-2">{d.modes.map((m: any) => <li key={m.mode} className="flex justify-between"><span className="capitalize">{String(m.mode).toLowerCase()} <span className="text-slate-500">({m.count})</span></span><b>{inr(m.amount)}</b></li>)}</ul> : <Empty t="No payment this month." />}</Card>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Biggest dues" to="/fees" link="Defaulters">{d.defaulters.length ? <ul className="text-sm divide-y divide-slate-100">{d.defaulters.map((r: any) => <li key={r.studentId} className="py-1.5 flex justify-between"><span>{r.name}</span><b className="text-brick">{inr(r.balance)}</b></li>)}</ul> : <Empty t="Nobody owes anything. 🎉" />}</Card>
      <Card title="Latest receipts" to="/fees">{d.recent.length ? <ul className="text-sm divide-y divide-slate-100">{d.recent.map((p: any) => <li key={p.id} className="py-1.5 flex justify-between"><span>{p.name}<div className="text-xs text-slate-500">{dshort(p.paidOn)} · {String(p.mode).toLowerCase()}{p.receipt ? ` · ${p.receipt}` : ''}</div></span><b>{inr(p.amount)}</b></li>)}</ul> : <Empty t="No receipt yet." />}</Card>
    </div>
    <Notices items={d.notices} />
  </div>;
}

// ---------- other non-teaching staff ----------
function OtherStaff({ d }: { d: any }) {
  return <div className="space-y-4">
    <Hero title={`${hr()}, ${String(d.name).split(' ')[0]}`} sub={d.title || 'Non-teaching staff'} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><MyMonth me={d.me} /><Duties items={d.duties} /></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Card title="My leave" to="/records/staff-leave">{d.leaves.length ? <ul className="text-sm space-y-2">{d.leaves.map((l: any) => <li key={l.id} className="flex justify-between"><span>{l.reason}<div className="text-xs text-slate-500">{dshort(l.from)}{l.to ? ` – ${dshort(l.to)}` : ''}</div></span><Chip t={l.status} c={l.status === 'approved' ? 'bg-moss text-white' : l.status === 'rejected' ? 'bg-brick text-white' : 'bg-marigold-500'} /></li>)}</ul> : <Empty t="No leave applied." />}</Card>
      <Card title="Coming up">{d.events.length ? <ul className="text-sm space-y-2">{d.events.map((e: any) => <li key={e.id} className="flex justify-between"><b>{e.title}</b><span className="text-slate-500">{dshort(e.date)}</span></li>)}</ul> : <Empty t="No event or holiday soon." />}</Card></div>
    <Notices items={d.notices} />
  </div>;
}

/** The home screen for everyone except the owner: shows the layout that suits the person's job. */
export default function RoleHome({ data }: { data: any }) {
  const [t, setT] = useState(0); useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 60000); return () => clearInterval(i); }, []); void t; // refresh "Now" markers every minute
  switch (data.kind) {
    case 'student': case 'parent': return <Family d={data} />;
    case 'teacher': return <Teacher d={data} />;
    case 'driver': return <Driver d={data} />;
    case 'frontoffice': return <FrontOffice d={data} />;
    case 'hr': return <HR d={data} />;
    case 'accounts': return <Accounts d={data} />;
    default: return <OtherStaff d={data} />;
  }
}
