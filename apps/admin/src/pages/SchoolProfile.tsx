import { useEffect, useState } from 'react';
import { api, session } from '../api';
const DEFAULT = [{ min: 91, grade: 'A1' }, { min: 81, grade: 'A2' }, { min: 71, grade: 'B1' }, { min: 61, grade: 'B2' }, { min: 51, grade: 'C1' }, { min: 41, grade: 'C2' }, { min: 33, grade: 'D' }, { min: 0, grade: 'E' }];
/** School profile: letterhead details used on certificates and report cards, academic session, grading scale. */
export default function SchoolProfile() {
  const [f, setF] = useState<any>({ academicSession: '', board: '', udiseCode: '', affiliationNo: '', principalName: '', address: '', phone: '', website: '' }); const [scale, setScale] = useState<any[]>(DEFAULT); const [msg, setMsg] = useState('');
  useEffect(() => { api('/subscription').then((s) => setF((p: any) => Object.fromEntries(Object.keys(p).map((k) => [k, s[k] || ''])))); api('/exams/grade-scale').then(setScale).catch(() => {}); }, []);
  const school = session.user?.institutionType === 'school'; const k = (key: string, label: string, ph = '') => <div><label className="text-sm font-medium">{label}</label><input className="input" placeholder={ph} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} /></div>;
  return (
    <div>
      <h1 className="text-2xl font-bold">{school ? 'School' : 'Centre'} profile</h1><p className="text-sm text-slate-600">Printed on the letterhead of report cards, certificates and payslips.</p>
      <div className="card p-5 mt-4"><div className="grid grid-cols-3 gap-4">{k('academicSession', 'Academic session', '2026-27')}{school && k('board', 'Board', 'CBSE / ICSE / JAC / State')}{school && k('udiseCode', 'UDISE code')}{school && k('affiliationNo', 'Affiliation no')}{k('principalName', school ? 'Principal name' : 'Director name')}{k('phone', 'Phone')}{k('website', 'Website')}<div className="col-span-3">{k('address', 'Address')}</div></div>
        <button className="btn mt-4" onClick={async () => { await api('/subscription/profile', { method: 'PUT', body: JSON.stringify(f) }); setMsg('Saved'); }}>Save profile</button>{msg && <span className="text-sm text-moss ml-3">{msg}</span>}</div>
      {school && <div className="card p-5 mt-5"><h2 className="font-semibold">Grading scale</h2><p className="text-sm text-slate-600">Percentage at or above “from” gets that grade. Default is the CBSE 8-point scale.</p>
        <table className="mt-3 text-sm"><tbody>{scale.map((s, i) => <tr key={i}><td className="pr-3 py-1">From %</td><td><input className="input w-24 py-1" type="number" value={s.min} onChange={(e) => setScale(scale.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)))} /></td><td className="px-3">grade</td><td><input className="input w-24 py-1" value={s.grade} onChange={(e) => setScale(scale.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} /></td><td><button className="btn-quiet" onClick={() => setScale(scale.filter((_, j) => j !== i))}>×</button></td></tr>)}</tbody></table>
        <div className="flex gap-2 mt-3"><button className="btn-quiet" onClick={() => setScale([...scale, { min: 0, grade: '' }])}>+ Add grade</button><button className="btn-quiet" onClick={() => setScale(DEFAULT)}>Reset to CBSE</button><button className="btn" onClick={async () => { await api('/exams/grade-scale', { method: 'PUT', body: JSON.stringify({ scale: scale.filter((x) => x.grade) }) }); setMsg('Grading scale saved'); }}>Save scale</button></div></div>}
    </div>
  );
}
