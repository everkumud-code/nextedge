import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';
const post = async (path: string, body: any) => { const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(Array.isArray(d.message) ? d.message.join(', ') : d.message || 'Something went wrong'); return d; };
const toData = (f: File) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('Could not read the file')); fr.readAsDataURL(f); });

// Defined outside the screen component on purpose: a component created inside another one is rebuilt on every keystroke and the typing box loses focus.
const L = ({ l, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{l}</label>{children}</div>;

/** Public online admission form (no login): details, documents, optional mobile OTP. Link: /apply/<school id>. Tracking: /apply/<school id>/status. */
export default function Apply() {
  const { centreId } = useParams(); const [info, setInfo] = useState<any>(null); const [err, setErr] = useState(''); const [done, setDone] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<any>({ childName: '', dob: '', gender: '', classApplying: '', fatherName: '', motherName: '', parentMobile: '', parentEmail: '', address: '', previousSchool: '', category: '', religion: '', bloodGroup: '', website: '', consent: false, photoConsent: false });
  const [docs, setDocs] = useState<Record<string, File | null>>({}); const [otp, setOtp] = useState<{ sent: boolean; code: string; token: string; mobile: string; msg: string }>({ sent: false, code: '', token: '', mobile: '', msg: '' }); const files = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => { fetch(`${API}/public/admission/${centreId}`).then(async (r) => { if (!r.ok) throw new Error('School not found'); setInfo(await r.json()); }).catch((e) => setErr(e.message)); }, [centreId]);
  const set = (k: string) => (e: any) => { setF({ ...f, [k]: k === 'parentMobile' ? e.target.value.replace(/\D/g, '') : e.target.value }); if (k === 'parentMobile' && otp.mobile && e.target.value.replace(/\D/g, '') !== otp.mobile) setOtp({ sent: false, code: '', token: '', mobile: '', msg: '' }); };
  const verified = !info?.otpRequired || (otp.token && otp.mobile === f.parentMobile);
  async function sendOtp() { setErr(''); setBusy(true); try { const r = await post(`/public/admission/${centreId}/otp`, { mobile: f.parentMobile }); setOtp({ sent: true, code: '', token: '', mobile: '', msg: `OTP sent by ${r.via === 'whatsapp' ? 'WhatsApp' : 'SMS'} to ${r.to}` }); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function verify() { setErr(''); setBusy(true); try { const r = await post(`/public/admission/${centreId}/verify`, { mobile: f.parentMobile, code: otp.code }); setOtp({ ...otp, token: r.otpToken, mobile: f.parentMobile, msg: 'Mobile number verified' }); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function submit() {
    setErr(''); setBusy(true);
    try { const documents = []; for (const [type, file] of Object.entries(docs)) if (file) documents.push({ type, name: file.name, mime: file.type, data: await toData(file) }); const d = await post(`/public/admission/${centreId}`, { ...f, otpToken: otp.token || undefined, documents }); setDone(d); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  if (err && !info) return <div className="min-h-screen grid place-items-center"><p className="text-brick">{err}</p></div>; if (!info) return <div className="min-h-screen grid place-items-center text-slate-500">Loading...</div>;
  return (
    <div className="min-h-screen bg-teal-900 py-8 px-4"><div className="max-w-3xl mx-auto card p-8">
      <img src="/nextedge-logo.png" alt="NextEdge" className="h-8 mb-3" /><h1 className="text-2xl font-bold">{info.name}</h1><p className="text-slate-600 text-sm">{[info.address || info.city, info.phone && `Ph ${info.phone}`].filter(Boolean).join(' · ')}</p>
      {done ? <div className="mt-6 p-5 rounded-lg bg-moss/10"><h2 className="text-xl font-semibold text-moss">✓ Application received</h2><p className="mt-2">Your reference is <b className="text-lg tracking-wider">{done.reference}</b>{done.documents ? ` · ${done.documents} document(s) uploaded` : ''}. Save it — you can check the progress any time with this reference and <b>{f.parentMobile}</b>.</p><p className="mt-2 text-sm text-slate-600">The school office will contact you about the next steps (interview / test, fees).</p><Link className="btn mt-4 inline-block" to={`/apply/${centreId}/status?ref=${done.reference}&mobile=${f.parentMobile}`}>Track my application</Link></div> : <>
        <div className="flex items-center justify-between mt-6"><h2 className="text-lg font-semibold">Admission application{info.session ? ` — session ${info.session}` : ''}</h2><Link to={`/apply/${centreId}/status`} className="text-sm underline text-edge-600">Already applied? Track status</Link></div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <L l="Child's full name *"><input className="input" value={f.childName} onChange={set('childName')} /></L>
          <L l="Class applying for *"><select className="input" value={f.classApplying} onChange={set('classApplying')}><option value="">Select</option>{info.classes.map((c: string) => <option key={c}>{c}</option>)}</select></L>
          <L l="Date of birth"><input className="input" type="date" value={f.dob} onChange={set('dob')} /></L>
          <L l="Gender"><select className="input" value={f.gender} onChange={set('gender')}><option value="">--</option><option>Male</option><option>Female</option><option>Other</option></select></L>
          <L l="Father's name"><input className="input" value={f.fatherName} onChange={set('fatherName')} /></L><L l="Mother's name"><input className="input" value={f.motherName} onChange={set('motherName')} /></L>
          <L l="Parent mobile *"><div className="flex gap-2"><input className="input" maxLength={10} inputMode="numeric" value={f.parentMobile} onChange={set('parentMobile')} />{info.otpRequired && !verified && <button type="button" className="btn-quiet whitespace-nowrap" disabled={busy || f.parentMobile.length !== 10} onClick={sendOtp}>{otp.sent ? 'Resend OTP' : 'Send OTP'}</button>}</div></L><L l="Parent email"><input className="input" type="email" value={f.parentEmail} onChange={set('parentEmail')} /></L>
          {info.otpRequired && otp.sent && !verified && <L l="Enter the 6-digit OTP" span={2}><div className="flex gap-2"><input className="input w-40 tracking-widest" inputMode="numeric" maxLength={6} value={otp.code} onChange={(e) => setOtp({ ...otp, code: e.target.value.replace(/\D/g, '') })} /><button type="button" className="btn" disabled={busy || otp.code.length !== 6} onClick={verify}>Verify</button><span className="text-xs text-slate-500 self-center">{otp.msg}</span></div></L>}
          {info.otpRequired && verified && <div className="col-span-2 text-sm text-moss">✓ Mobile number verified</div>}
          <L l="Category"><select className="input" value={f.category} onChange={set('category')}><option value="">--</option>{['General', 'OBC', 'SC', 'ST', 'EWS'].map((c) => <option key={c}>{c}</option>)}</select></L><L l="Previous school (if any)"><input className="input" value={f.previousSchool} onChange={set('previousSchool')} /></L>
          <L l="Address" span={2}><textarea className="input" rows={2} value={f.address} onChange={set('address')} /></L>
          <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
        </div>
        <h3 className="font-semibold mt-6">Documents <span className="text-sm font-normal text-slate-500">(optional now — JPG, PNG or PDF, up to 3 MB each; photos are shrunk automatically)</span></h3>
        <div className="grid grid-cols-2 gap-3 mt-2">{info.documents.map((d: string) => <div key={d} className="border rounded-md px-3 py-2 flex items-center justify-between gap-2"><div className="text-sm"><div className="font-medium">{d}</div><div className="text-xs text-slate-500 truncate max-w-[180px]">{docs[d]?.name || 'No file chosen'}</div></div><div className="flex gap-2"><input ref={(el) => { files.current[d] = el; }} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setDocs({ ...docs, [d]: e.target.files?.[0] || null })} /><button type="button" className="btn-quiet" onClick={() => files.current[d]?.click()}>{docs[d] ? 'Change' : 'Choose'}</button>{docs[d] && <button type="button" className="text-brick text-sm" onClick={() => { setDocs({ ...docs, [d]: null }); if (files.current[d]) files.current[d]!.value = ''; }}>✕</button>}</div></div>)}</div>
        <div className="mt-5 rounded-md border p-3 text-sm bg-slate-50"><label className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} /><span>I am the parent / legal guardian of this child. I agree that <b>{info.name}</b> may collect and use my details and my child’s details for admission, school records, fees, communication, safety and what the board or law requires. I know I can ask the school to correct or delete this data, withdraw this consent, or complain to the school.</span></label>
          <label className="flex gap-2 items-start mt-3"><input type="checkbox" className="mt-1" checked={f.photoConsent} onChange={(e) => setF({ ...f, photoConsent: e.target.checked })} /><span>Optional: the school may show my child’s photo in school events, notices and its website. <span className="text-slate-500">(Leave unticked to say no — it does not affect admission.)</span></span></label></div>
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <button className="btn mt-5" disabled={busy || !f.consent || !f.childName || !f.classApplying || f.parentMobile.length !== 10 || !verified} onClick={submit}>{busy ? 'Submitting...' : 'Submit application'}</button>{info.otpRequired && !verified && f.parentMobile.length === 10 && <span className="text-xs text-slate-500 ml-3">Verify the mobile number first</span>}
      </>}
    </div></div>
  );
}

/** Parent checks the progress of an application: reference + mobile. */
export function ApplyStatus() {
  const { centreId } = useParams(); const q = new URLSearchParams(location.search); const [ref, setRef] = useState(q.get('ref') || ''); const [mobile, setMobile] = useState(q.get('mobile') || ''); const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [school, setSchool] = useState('');
  useEffect(() => { fetch(`${API}/public/admission/${centreId}`).then((r) => r.json()).then((i) => setSchool(i.name)).catch(() => {}); if (ref && mobile.length === 10) check(); }, []);
  async function check() { setErr(''); setD(null); setBusy(true); try { const r = await fetch(`${API}/public/admission/${centreId}/status?ref=${encodeURIComponent(ref.trim())}&mobile=${mobile}`); const j = await r.json(); if (!r.ok) throw new Error(Array.isArray(j.message) ? j.message.join(', ') : j.message); setD(j); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  return (
    <div className="min-h-screen bg-teal-900 py-8 px-4"><div className="max-w-xl mx-auto card p-8">
      <img src="/nextedge-logo.png" alt="NextEdge" className="h-8 mb-3" /><h1 className="text-xl font-bold">Track your admission application</h1>{school && <p className="text-slate-600 text-sm">{school}</p>}
      <div className="grid grid-cols-2 gap-3 mt-4"><div><label className="text-sm font-medium">Reference</label><input className="input uppercase tracking-wider" maxLength={8} value={ref} onChange={(e) => setRef(e.target.value.trim())} placeholder="8 characters" /></div><div><label className="text-sm font-medium">Parent mobile</label><input className="input" maxLength={10} inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} /></div></div>
      <button className="btn mt-4" disabled={busy || ref.length !== 8 || mobile.length !== 10} onClick={check}>{busy ? 'Checking...' : 'Check status'}</button>{err && <p className="text-brick text-sm mt-3">{err}</p>}
      {d && <div className="mt-6"><div className="flex justify-between"><div><div className="text-lg font-semibold">{d.childName}</div><div className="text-sm text-slate-600">Class {d.classApplying} · applied {d.appliedOn}</div></div><span className="tag h-fit">{d.reference}</span></div>
        <div className="mt-4 p-3 rounded-md bg-edge-50 font-medium">{d.label}</div>
        <ol className="mt-4 flex items-center">{d.stages.map((s: any, i: number) => <li key={s.key} className="flex-1 text-center"><div className={`mx-auto w-6 h-6 rounded-full grid place-items-center text-xs ${s.done ? 'bg-moss text-white' : 'bg-slate-200 text-slate-500'}`}>{s.done ? '✓' : i + 1}</div><div className="text-[11px] mt-1 text-slate-600">{s.label}</div></li>)}</ol>
        {d.interview && <p className="mt-4 text-sm"><b>Interview / test:</b> {new Date(d.interview.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{d.interview.time ? ` at ${d.interview.time}` : ''}</p>}
        {d.remark && <p className="mt-2 text-sm bg-slate-50 rounded p-3"><b>Message from the school:</b> {d.remark}</p>}
        {d.admissionNo && <p className="mt-2 text-sm"><b>Admission no:</b> {d.admissionNo}. Log in to the NextEdge app with your mobile number.</p>}
        <p className="text-xs text-slate-500 mt-4">{d.documents} document(s) received.</p></div>}
    </div></div>
  );
}
