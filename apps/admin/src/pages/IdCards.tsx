import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, openPdf, uploadFile } from '../api';
import AuthImg from '../components/AuthImg';
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Student ID cards: add photos (one by one or many at once, named by roll no / admission no / name), then print a class as one PDF. */
export default function IdCards() {
  const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState(''); const [all, setAll] = useState<any[]>([]); const [photos, setPhotos] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const bulk = useRef<HTMLInputElement>(null);
  const loadPhotos = () => api('/files/photo-map?kind=student-photo').then(setPhotos).catch(() => {});
  useEffect(() => { api('/batches').then((b) => { setBatches(b); if (b[0]) setBatchId(b[0].id); }); api('/students').then(setAll); loadPhotos(); }, []);
  const list = useMemo(() => all.filter((s) => s.active && s.batchId === batchId), [all, batchId]); const withPhoto = list.filter((s) => photos[s.id]).length; const school = batches.some((b) => b.className);
  async function one(s: any, f?: File | null) { if (!f) return; setMsg(''); try { await uploadFile(f, 'student-photo', s.id); await loadPhotos(); setMsg(`Photo saved for ${s.name}`); } catch (e: any) { setMsg(`${s.name}: ${e.message}`); } }
  async function many(files: FileList | null) {
    if (!files?.length) return; setBusy(true); setMsg(''); let ok = 0; const skipped: string[] = [];
    for (const f of Array.from(files)) { const base = norm(f.name.replace(/\.[^.]+$/, '')); const s = list.find((x) => norm(x.rollNo) === base || norm(x.admissionNo) === base || norm(x.name) === base); if (!s) { skipped.push(f.name); continue; } try { await uploadFile(f, 'student-photo', s.id); ok++; } catch { skipped.push(f.name); } }
    await loadPhotos(); setBusy(false); setMsg(`${ok} photo(s) matched and saved.${skipped.length ? ` Not matched: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}` : ''}`); if (bulk.current) bulk.current.value = '';
  }
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold">ID cards</h1><p className="text-sm text-slate-600">Credit-card size cards with photo, details and QR code — 10 per A4 sheet.</p></div>
        <div className="flex gap-2 items-center"><select className="input w-60" value={batchId} onChange={(e) => setBatchId(e.target.value)}>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="btn" disabled={!list.length} onClick={() => openPdf(`/idcards/cards.pdf?batchId=${batchId}`, 'Could not create the ID cards')}>Print class ID cards (PDF)</button></div></div>
      <div className="card p-4 mt-4 flex items-center gap-4 flex-wrap text-sm"><div><b>{withPhoto}</b> of <b>{list.length}</b> students have a photo</div>{withPhoto < list.length && <div className="text-brick">Cards without a photo print an empty photo box.</div>}
        <div className="ml-auto flex items-center gap-2"><input ref={bulk} type="file" accept="image/*" multiple className="hidden" onChange={(e) => many(e.target.files)} /><button className="btn-quiet" disabled={busy} onClick={() => bulk.current?.click()}>{busy ? 'Uploading…' : 'Add many photos at once'}</button></div></div>
      <p className="text-xs text-slate-500 mt-2">For many at once, name each file with the student’s roll number, admission number or full name (e.g. <span className="font-mono">12.jpg</span>, <span className="font-mono">ADM-2026-014.jpg</span>). Large phone photos are shrunk automatically.</p>
      {msg && <p className="text-sm mt-2 text-moss">{msg}</p>}
      <table className="card w-full mt-4 text-sm"><thead><tr><th className="th w-14">Roll</th><th className="th w-16">Photo</th><th className="th">Student</th><th className="th">{school ? 'Admission no' : 'Batch'}</th><th className="th">Parent mobile</th><th className="th"></th></tr></thead>
        <tbody>{list.map((s) => <tr key={s.id}><td className="td text-slate-500">{s.rollNo || '—'}</td>
          <td className="td">{photos[s.id] ? <AuthImg id={photos[s.id]} className="w-10 h-12 object-cover rounded border" /> : <div className="w-10 h-12 rounded border border-dashed grid place-items-center text-[10px] text-slate-400">none</div>}</td>
          <td className="td font-medium"><Link className="hover:underline" to={`/students/${s.id}`}>{s.name}</Link></td><td className="td">{school ? s.admissionNo || '—' : batches.find((b) => b.id === s.batchId)?.name}</td><td className="td">{s.parentMobile}</td>
          <td className="td whitespace-nowrap"><label className="btn-quiet cursor-pointer">{photos[s.id] ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => one(s, e.target.files?.[0])} /></label> <button className="btn-quiet" onClick={() => openPdf(`/idcards/student/${s.id}.pdf`, 'Could not create the ID card')}>Card</button></td></tr>)}
          {!list.length && <tr><td className="td text-slate-500" colSpan={6}>No active students in this class.</td></tr>}</tbody></table>
    </div>
  );
}
