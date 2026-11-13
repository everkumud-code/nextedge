import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const inr = (n: number) => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const short = (n: number) => { n = Number(n || 0); return n >= 1e7 ? (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(n)); };
const TEAL = '#0F766E', GOLD = '#F2A93B', MOSS = '#2F8F5B', BRICK = '#C4412B', SLATE = '#94A3B8', BLUE = '#2563EB';
const STATUS_COL: Record<string, string> = { active: MOSS, trial: BLUE, grace: GOLD, suspended: BRICK };

// Small building blocks live outside the screen so nothing is rebuilt on every render.
function Tile({ label, value, note, tone, icon }: { label: string; value: any; note?: string; tone?: 'good' | 'warn' | 'bad'; icon: string }) {
  const col = tone === 'bad' ? 'text-brick' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-moss' : '';
  return <div className="card p-4 relative overflow-hidden"><div className="absolute right-3 top-3 w-9 h-9 rounded-lg bg-teal-100 grid place-items-center text-lg" aria-hidden>{icon}</div>
    <div className="text-xs uppercase tracking-wide text-slate-500 pr-10">{label}</div><div className={`text-3xl font-bold mt-1 tracking-tight ${col}`}>{value}</div>{note && <div className="text-xs text-slate-500 mt-1">{note}</div>}</div>;
}
function Panel({ title, sub, to, link, children, className = '' }: { title: string; sub?: string; to?: string; link?: string; children: any; className?: string }) {
  return <div className={`card p-5 ${className}`}><div className="flex justify-between items-start mb-3"><div><h2 className="font-semibold">{title}</h2>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>{to && <Link className="text-sm underline shrink-0" to={to}>{link || 'Open'}</Link>}</div>{children}</div>;
}
function Donut({ items, label }: { items: { label: string; value: number; color: string }[]; label: string }) {
  const total = items.reduce((s, i) => s + i.value, 0), S = 180, r = 66, C = 2 * Math.PI * r; let off = 0;
  if (!total) return <p className="text-sm text-slate-500">Nothing to show yet.</p>;
  return <div className="text-center"><svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} className="mx-auto"><circle cx={S / 2} cy={S / 2} r={r} fill="none" stroke="currentColor" className="text-slate-100" strokeWidth={24} />
    {items.map((it, i) => { const len = (it.value / total) * C; const el = <circle key={i} cx={S / 2} cy={S / 2} r={r} fill="none" stroke={it.color} strokeWidth={24} strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-off} transform={`rotate(-90 ${S / 2} ${S / 2})`}><title>{`${it.label}: ${it.value}`}</title></circle>; off += len; return el; })}
    <text x={S / 2} y={S / 2 - 2} textAnchor="middle" fontSize="28" fontWeight="700" fill="currentColor">{total}</text><text x={S / 2} y={S / 2 + 17} textAnchor="middle" fontSize="11" fill="#64748b">{label}</text></svg>
    <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-xs text-slate-600 mt-1">{items.map((i) => <span key={i.label}><i className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]" style={{ background: i.color }} />{i.label} {i.value}</span>)}</div></div>;
}
function HBars({ items, fmt = (n: number) => String(n) }: { items: { label: string; value: number; color?: string }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="text-sm text-slate-500">Nothing to show yet.</p>;
  return <div>{items.map((i) => <div key={i.label} className="grid grid-cols-[110px_1fr_46px] gap-2 items-center my-2 text-sm"><span className="text-slate-600 truncate" title={i.label}>{i.label}</span><div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color || TEAL }} /></div><b className="text-right">{fmt(i.value)}</b></div>)}</div>;
}
function Columns({ data, color = TEAL }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value)); const W = 360, H = 150, L = 8, B = 22, bw = (W - L * 2) / data.length;
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full" height={H}>{[0.5, 1].map((f) => <line key={f} x1={L} x2={W - L} y1={(H - B) * (1 - f) + 6} y2={(H - B) * (1 - f) + 6} stroke="#e2e8f0" strokeDasharray="3 4" />)}
    {data.map((d, i) => { const h = ((H - B - 12) * d.value) / max; const x = L + i * bw + bw * 0.18; return <g key={d.label}><rect x={x} y={H - B - h} width={bw * 0.64} height={Math.max(h, d.value ? 2 : 0)} rx={4} fill={color}><title>{`${d.label}: ${d.value}`}</title></rect>{d.value > 0 && <text x={x + bw * 0.32} y={H - B - h - 4} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="600">{d.value}</text>}<text x={x + bw * 0.32} y={H - 6} textAnchor="middle" fontSize="11" fill="#64748b">{d.label}</text></g>; })}</svg>;
}

/** The super admin's landing page: how the whole platform is doing, in a glance. */
export default function PlatformHome() {
  const [rows, setRows] = useState<any[] | null>(null); const [sum, setSum] = useState<any>(null); const [demo, setDemo] = useState(false);
  useEffect(() => { api('/platform/centres').then(setRows).catch(() => setRows([])); api('/platform/summary').then(setSum).catch(() => {}); }, []);
  const d = useMemo(() => {
    const all = rows || []; const list = all.filter((r) => demo || r.plan !== 'demo'); const demoN = all.filter((r) => r.plan === 'demo').length;
    const status = (r: any) => r.settings?.status || 'trial'; const byStatus: Record<string, number> = {}; const byPlan: Record<string, number> = {}; const byType = { coaching: 0, school: 0 } as Record<string, number>;
    let students = 0, billing = 0;
    for (const r of list) {
      byStatus[status(r)] = (byStatus[status(r)] || 0) + 1; byPlan[r.plan] = (byPlan[r.plan] || 0) + 1; byType[r.institutionType || 'coaching'] = (byType[r.institutionType || 'coaching'] || 0) + 1; students += r.activeStudents || 0;
      if (status(r) === 'active') { const price = Number(r.settings?.pricePerStudent || 0), min = Number(r.settings?.minStudents || 0), n = Math.max(r.activeStudents || 0, min); const per = r.settings?.billingCycle === 'yearly' ? 12 : r.settings?.billingCycle === 'quarterly' ? 3 : 1; billing += (price * n) / per; }
    }
    const now = new Date(); const months = Array.from({ length: 6 }, (_, i) => { const m = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return { key: `${m.getFullYear()}-${m.getMonth()}`, label: m.toLocaleString('en', { month: 'short' }), value: 0 }; });
    for (const r of list) { const c = new Date(r.createdAt); const m = months.find((x) => x.key === `${c.getFullYear()}-${c.getMonth()}`); if (m) m.value++; }
    const top = [...list].sort((a, b) => (b.activeStudents || 0) - (a.activeStudents || 0)).slice(0, 8).map((r) => ({ label: r.name, value: r.activeStudents || 0 }));
    const attention = list.filter((r) => ['grace', 'suspended'].includes(status(r)) || r.openInvoice).slice(0, 8);
    const recent = [...list].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 6);
    return { list, demoN, byStatus, byPlan, byType, students, billing, months, top, attention, recent, status };
  }, [rows, demo]);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  if (rows === null) return <p className="text-slate-500">Loading…</p>;
  const need = (d.byStatus.grace || 0) + (d.byStatus.suspended || 0);
  return (
    <div>
      <div className="rounded-xl p-5 text-white flex flex-wrap items-center justify-between gap-3 mb-5" style={{ background: 'linear-gradient(135deg,#0F766E,#134E4A)' }}>
        <div><h1 className="text-2xl font-bold">Platform overview</h1><p className="text-teal-100/80 text-sm">{today} · {d.list.length} client{d.list.length === 1 ? '' : 's'} on NextEdge</p></div>
        <div className="flex gap-2 flex-wrap"><Link to="/clients" className="btn-quiet !text-white !border-white/40 hover:!bg-white/10">All clients</Link><Link to="/onboard" className="btn !bg-white !text-teal-900">+ Onboard a client</Link></div>
      </div>
      {d.demoN > 0 && <label className="text-sm text-slate-600 flex items-center gap-2 mb-3 cursor-pointer"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Include {d.demoN} demo client{d.demoN === 1 ? '' : 's'}</label>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-5">
        <Tile icon="🏫" label="Clients" value={d.list.length} note={`${d.byType.school || 0} schools · ${d.byType.coaching || 0} coaching`} />
        <Tile icon="🎓" label="Active students" value={short(d.students)} note="across all clients" />
        <Tile icon="💰" label="Collected this month" value={inr(sum?.collectedThisMonth || 0)} tone="good" note="subscription payments" />
        <Tile icon="🧾" label="Outstanding" value={inr(sum?.outstanding || 0)} tone={(sum?.outstanding || 0) > 0 ? 'warn' : undefined} note="invoices due" />
        <Tile icon="⚠️" label="Needs attention" value={need} tone={need ? 'bad' : 'good'} note={`${d.byStatus.grace || 0} in grace · ${d.byStatus.suspended || 0} suspended`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 mb-5">
        <Panel title="Clients by status" sub="Trial, paying, late, switched off"><Donut label="clients" items={['active', 'trial', 'grace', 'suspended'].map((k) => ({ label: k, value: d.byStatus[k] || 0, color: STATUS_COL[k] })).filter((i) => i.value)} /></Panel>
        <Panel title="New clients, last 6 months" sub="Counted from when they were added"><Columns data={d.months} /></Panel>
        <Panel title="Estimated monthly billing" sub="Price × students for active clients (an estimate, not an invoice)"><div className="text-4xl font-bold tracking-tight mt-2">{inr(d.billing)}</div><div className="text-sm text-slate-500 mt-1">from {d.byStatus.active || 0} active client{(d.byStatus.active || 0) === 1 ? '' : 's'}</div>
          <div className="mt-4"><HBars items={Object.entries(d.byPlan).map(([k, v]) => ({ label: k, value: v, color: k === 'demo' ? SLATE : TEAL }))} /></div></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 mb-5">
        <Panel title="Biggest clients" sub="By active students" to="/clients" link="All clients"><HBars items={d.top} /></Panel>
        <Panel title="Needs attention" sub="Late, switched off or with an open invoice" to="/platform" link="Billing">
          {d.attention.length ? <table className="w-full text-sm"><tbody>{d.attention.map((r: any) => <tr key={r.id} className="border-b border-slate-100 last:border-0"><td className="py-2 font-medium">{r.name}</td><td><span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: STATUS_COL[d.status(r)] || SLATE }}>{d.status(r)}</span></td><td className="text-right">{r.openInvoice ? <b>{inr(r.openInvoice.amount)}</b> : <span className="text-slate-400">–</span>}</td></tr>)}</tbody></table> : <p className="text-sm text-moss">Everything is in order. 🎉</p>}
        </Panel>
      </div>
      <Panel title="Newest clients" sub="Latest to join" to="/clients" link="Open clients">
        {d.recent.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">Client</th><th>Type</th><th>City</th><th>Plan</th><th className="text-right">Students</th><th className="text-right">Joined</th></tr></thead><tbody>
          {d.recent.map((r: any) => <tr key={r.id} className="border-t border-slate-100"><td className="py-2"><b>{r.name}</b>{r.slug && <div className="text-xs text-slate-500">{r.slug}.nextsoftwares.in</div>}</td><td className="capitalize">{r.institutionType || 'coaching'}</td><td>{r.city || '–'}</td><td>{r.plan}</td><td className="text-right">{r.activeStudents || 0}</td><td className="text-right">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">No clients yet. Use “Onboard a client”.</p>}
      </Panel>
    </div>
  );
}
