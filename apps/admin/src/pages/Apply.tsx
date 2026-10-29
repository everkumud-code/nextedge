import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';

/** Public online admission form — no login. Link: /apply/<centre id>. */
export default function Apply() {
  const { centreId } = useParams(); const [info, setInfo] = useState<any>(null); const [err, setErr] = useState(''); const [done, setDone] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({ childName: '', dob: '', gender: '', classApplying: '', fatherName: '', motherName: '', parentMobile: '', parentEmail: '', address: '', previousSchool: '', category: '', religion: '', bloodGroup: '', website: '' });
  useEffect(() => { fetch(`${API}/public/admission/${centreId}`).then(async (r) => { if (!r.ok) throw new Error('School not found'); setInfo(await r.json()); }).catch((e) => setErr(e.message)); }, [centreId]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: k === 'parentMobile' ? e.target.value.replace(/\D/g, '') : e.target.value });
  async function submit() { setErr(''); setBusy(true); try { const r = await fetch(`${API}/public/admission/${centreId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }); const d = await r.json(); if (!r.ok) throw new Error(Array.isArray(d.message) ? d.message.join(', ') : d.message); setDone(d.reference || 'OK'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (err && !info) return <div className="min-h-screen grid place-items-center"><p className="text-brick">{err}</p></div>; if (!info) return <div className="min-h-screen grid place-items-center text-slate-500">Loading…</div>;
  const L = ({ l, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{l}</label>{children}</div>;
  return (
    <div className="min-h-screen bg-teal-900 py-8 px-4"><div className="max-w-3xl mx-auto card p-8">
      <img src="/nextedge-logo.png" alt="NextEdge" className="h-8 mb-3" /><h1 className="text-2xl font-bold">{info.name}</h1><p className="text-slate-600 text-sm">{[info.address || info.city, info.phone && `Ph ${info.phone}`].filter(Boolean).join(' · ')}</p>
      {done ? <div className="mt-6 p-5 rounded-lg bg-moss/10"><h2 className="text-xl font-semibold text-moss">✅ Application received</h2><p className="mt-2">Reference <b>{done}</b>. The school office will contact you on <b>{f.parentMobile}</b> about the next steps (documents, interview/test, fees).</p></div> : <>
        <h2 className="text-lg font-semibold mt-6">Admission application{info.session ? ` — session ${info.session}` : ''}</h2>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <L l="Child’s full name *"><input className="input" value={f.childName} onChange={set('childName')} /></L>
          <L l="Class applying for *"><select className="input" value={f.classApplying} onChange={set('classApplying')}><option value="">Select</option>{info.classes.map((c: string) => <option key={c}>{c}</option>)}</select></L>
          <L l="Date of birth"><input className="input" type="date" value={f.dob} onChange={set('dob')} /></L>
          <L l="Gender"><select className="input" value={f.gender} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></L>
          <L l="Father’s name"><input className="input" value={f.fatherName} onChange={set('fatherName')} /></L><L l="Mother’s name"><input className="input" value={f.motherName} onChange={set('motherName')} /></L>
          <L l="Parent mobile *"><input className="input" maxLength={10} inputMode="numeric" value={f.parentMobile} onChange={set('parentMobile')} /></L><L l="Parent email"><input className="input" type="email" value={f.parentEmail} onChange={set('parentEmail')} /></L>
          <L l="Category"><select className="input" value={f.category} onChange={set('category')}><option value="">—</option>{['General', 'OBC', 'SC', 'ST', 'EWS'].map((c) => <option key={c}>{c}</option>)}</select></L><L l="Previous school (if any)"><input className="input" value={f.previousSchool} onChange={set('previousSchool')} /></L>
          <L l="Address" span={2}><textarea className="input" rows={2} value={f.address} onChange={set('address')} /></L>
          <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
        </div>
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <button className="btn mt-5" disabled={busy || !f.childName || !f.classApplying || f.parentMobile.length !== 10} onClick={submit}>{busy ? 'Submitting…' : 'Submit application'}</button><p className="text-xs text-slate-500 mt-3">The school will contact you for documents (birth certificate, previous marksheet/TC, Aadhaar, photos).</p></>}
    </div></div>
  );
}
