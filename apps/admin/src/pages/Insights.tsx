import { useEffect, useState } from 'react';
import { api, session } from '../api';
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
async function download(path: string, name: string) { const r = await fetch(API + path, { headers: { Authorization: `Bearer ${session.token}` } }); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); }

/** Reports & graphs: strength, collection, attendance, exam averages, funnel, discipline; UDISE+ exports; teacher ratings. */
export default function Insights() {
  const [d, setD] = useState<any>(null); const [tf, setTf] = useState<any[]>([]); const school = session.user?.institutionType === 'school';
  useEffect(() => { api('/insights/overview').then(setD); if (['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role || '')) api('/records/teacher-feedback/summary').then(setTf).catch(() => {}); }, []);
  if (!d) return <p className="text-slate-500">Loading…</p>;
  return (
    <div>
      <h1 className="text-2xl font-bold">Reports & graphs</h1>
      <div className="grid grid-cols-5 gap-4 mt-4">{[['Students', d.totals.students], ['Classes / batches', d.totals.batches], ['Collected this month', inr(d.totals.collectedThisMonth)], ['Library books out', d.totals.loansOut], ['Visitors today', d.totals.visitorsToday]].map(([l, v]) => <div key={l as string} className="card p-4"><div className="text-sm text-slate-600">{l}</div><div className="text-2xl font-bold mt-1">{v}</div></div>)}</div>
      <div className="grid grid-cols-2 gap-5 mt-5">
        <Chart title="Fee collection — last 6 months" data={d.collection.map((x: any) => ({ label: x.label.slice(5), value: x.value }))} fmt={inr} />
        <Chart title="Attendance % this month, by class" data={d.attendancePct} suffix="%" max={100} colour="#3f8f5b" />
        <Stacked title="Strength by class (boys / girls)" data={d.strength} />
        {d.examAvg.length > 0 && <Chart title="Latest exam average %, by class" data={d.examAvg} suffix="%" max={100} colour="#F2A93B" />}
        <Chart title="Enquiry pipeline" data={d.enquiries} colour="#6b5bd2" />
        {school && <Chart title="Discipline incidents — last 6 months" data={d.discipline.map((x: any) => ({ label: x.label.slice(5), value: x.value }))} colour="#c0453a" />}
        <div className="card p-4"><h2 className="font-semibold mb-2">Gender & category</h2><div className="flex gap-6"><div className="text-sm">{Object.entries(d.gender).filter(([, v]: any) => v > 0).map(([k, v]: any) => <div key={k}>{k}: <b>{v}</b></div>)}</div><div className="text-sm">{Object.entries(d.category).map(([k, v]: any) => <div key={k}>{k}: <b>{v}</b></div>)}</div></div></div>
      </div>
      {school && <div className="card p-5 mt-5"><h2 className="font-semibold">Government reports (UDISE+ style)</h2><p className="text-sm text-slate-600 mt-1">Opens in Excel. Fill the school’s UDISE code in <a className="underline" href="/school-profile">School profile</a> first. Use these sheets to fill the UDISE+ portal quickly; the portal upload itself is done by the school.</p>
        <div className="flex gap-2 mt-3 flex-wrap"><button className="btn" onClick={() => download('/insights/udise.csv?type=enrolment', 'udise-enrolment.csv')}>Enrolment by class, gender & category</button><button className="btn-quiet" onClick={() => download('/insights/udise.csv?type=students', 'udise-students.csv')}>Student-wise sheet</button><button className="btn-quiet" onClick={() => download('/insights/udise.csv?type=staff', 'udise-staff.csv')}>Teacher & staff sheet</button></div></div>}
      {tf.length > 0 && <div className="card p-5 mt-5"><h2 className="font-semibold mb-2">Teacher ratings (from students & parents)</h2><table className="w-full text-sm"><thead><tr><th className="th">Teacher</th><th className="th">Average</th><th className="th">Responses</th><th className="th">Recent comments</th></tr></thead><tbody>{tf.map((t) => <tr key={t.staffId || t.name}><td className="td font-medium">{t.name}</td><td className="td"><span className={`font-bold ${t.average < 3 ? 'text-brick' : 'text-moss'}`}>{t.average} / 5</span></td><td className="td">{t.count}</td><td className="td text-slate-600 text-xs">{t.comments.join(' · ')}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
function Chart({ title, data, suffix = '', max, colour = '#1673D9', fmt }: any) {
  const m = max || Math.max(1, ...data.map((x: any) => x.value)); const h = 150;
  return <div className="card p-4"><h2 className="font-semibold mb-3">{title}</h2>{data.length === 0 || data.every((x: any) => !x.value) ? <p className="text-sm text-slate-500 py-8 text-center">No data yet</p> : <svg viewBox={`0 0 ${Math.max(300, data.length * 56)} ${h + 40}`} className="w-full"><line x1="0" x2="1000" y1={h} y2={h} stroke="#dde3ea" />{data.map((x: any, i: number) => { const bh = Math.round((x.value / m) * (h - 20)); const bx = i * 56 + 10; return <g key={i}><rect x={bx} y={h - bh} width="36" height={bh} rx="3" fill={colour} /><text x={bx + 18} y={h - bh - 4} textAnchor="middle" fontSize="10" fill="#3D4A5A">{fmt ? fmt(x.value) : x.value + suffix}</text><text x={bx + 18} y={h + 14} textAnchor="middle" fontSize="9" fill="#6A7179">{String(x.label).replace('Class ', '').slice(0, 9)}</text></g>; })}</svg>}</div>;
}
function Stacked({ title, data }: any) {
  const m = Math.max(1, ...data.map((x: any) => x.value)); const h = 150;
  return <div className="card p-4"><h2 className="font-semibold mb-3">{title}</h2>{data.length === 0 ? <p className="text-sm text-slate-500 py-8 text-center">No classes yet</p> : <svg viewBox={`0 0 ${Math.max(300, data.length * 56)} ${h + 40}`} className="w-full"><line x1="0" x2="1000" y1={h} y2={h} stroke="#dde3ea" />{data.map((x: any, i: number) => { const bx = i * 56 + 10; const bh = (n: number) => Math.round((n / m) * (h - 20)); const g = bh(x.girls), b = bh(x.boys); return <g key={i}><rect x={bx} y={h - g} width="36" height={g} fill="#e58aa5" /><rect x={bx} y={h - g - b} width="36" height={b} fill="#1673D9" /><text x={bx + 18} y={h - g - b - 4} textAnchor="middle" fontSize="10" fill="#3D4A5A">{x.value}</text><text x={bx + 18} y={h + 14} textAnchor="middle" fontSize="9" fill="#6A7179">{String(x.label).replace('Class ', '').slice(0, 9)}</text></g>; })}<text x="6" y={h + 32} fontSize="9" fill="#1673D9">■ boys</text><text x="50" y={h + 32} fontSize="9" fill="#e58aa5">■ girls</text></svg>}</div>;
}
