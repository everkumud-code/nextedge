import { useEffect, useRef, useState } from 'react';
import { api, session } from '../api';
import { planOptions } from './PackFields';

const toData = (f: File) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('Could not read the file')); fr.readAsDataURL(f); });
const mobile10 = (v: any) => { const d = String(v ?? '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const ORDER = ['staff', 'students', 'enquiries', 'books', 'items'];
const LOGIN_URL = 'https://nextedge.nextsoftwares.in';
const csvOf = (head: string[], rows: string[][]) => '﻿' + [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
const standardBells = () => { const out: any[] = []; let t = 8 * 60; const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; let n = 0; for (let i = 1; i <= 8; i++) { out.push({ no: ++n, name: `Period ${i}`, startTime: f(t), endTime: f(t + 40), isBreak: false }); t += 40; if (i === 4) { out.push({ no: ++n, name: 'Lunch break', startTime: f(t), endTime: f(t + 30), isBreak: true }); t += 30; } } return out; };

/** Onboard a school or coaching that is moving from another software: details, then their export file(s), then one click. */
export default function Onboard() {
  const [packs, setPacks] = useState<any[]>([]); const [f, setF] = useState({ institutionType: 'school', name: '', city: '', adminName: '', adminMobile: '', adminEmail: '', plan: 'pro' });
  const [items, setItems] = useState<any[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [createClasses, setCreateClasses] = useState(true); const [bells, setBells] = useState(true);
  const [progress, setProgress] = useState<string[]>([]); const [report, setReport] = useState<any>(null); const pick = useRef<HTMLInputElement>(null); const files = useRef<Map<string, File>>(new Map());
  const [kinds, setKinds] = useState<any[]>([]);
  useEffect(() => { api('/platform/packs').then(setPacks).catch(() => {}); api('/import/kinds').then((k) => setKinds(k.kinds || [])).catch(() => {}); }, []);
  const ready = f.name.trim().length > 1 && f.adminName.trim() && /^\d{10}$/.test(f.adminMobile) && /^\S+@\S+\.\S+$/.test(f.adminEmail);

  const recordsOf = (it: any) => it.rows.map((r: string[]) => Object.fromEntries(Object.entries(it.mapping).map(([i, k]) => [k as string, r[Number(i)] ?? ''])));
  const validCount = (it: any) => { const recs = recordsOf(it); const need = (r: any) => (it.kind === 'students' ? r.name && mobile10(r.parentMobile) : it.kind === 'staff' || it.kind === 'enquiries' ? r.name && mobile10(r.mobile) : r.title); return recs.filter((r: any) => String(need(r) || '').length > 0).length; };

  async function addFiles(list: FileList | null) {
    if (!list?.length) return; setErr(''); setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const r = await api('/import/auto', { method: 'POST', body: JSON.stringify({ file: { name: file.name, mime: file.type, data: await toData(file) } }) });
        for (const x of r.files) { const id = `${file.name}::${x.sheet}`; files.current.set(id, file); setItems((cur) => [...cur.filter((c) => c.id !== id), { ...x, id, file: file.name, include: x.missing.length === 0 }]); }
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); if (pick.current) pick.current.value = ''; }
  }
  async function recheck(it: any, kind: string) {
    setErr(''); const file = files.current.get(it.id); if (!file) return;
    try { const r = await api('/import/auto', { method: 'POST', body: JSON.stringify({ file: { name: file.name, mime: file.type, data: await toData(file) }, kind }) }); const x = r.files.find((y: any) => y.sheet === it.sheet) || r.files[0]; if (x) setItems((cur) => cur.map((c) => (c.id === it.id ? { ...c, ...x, include: x.missing.length === 0 } : c))); } catch (e: any) { setErr(e.message); }
  }
  const say = (m: string) => setProgress((p) => [...p, m]);

  async function run() {
    setErr(''); setBusy(true); setProgress([]); setReport(null); const out: any = { kinds: {}, problems: [] as any[], classes: [] as string[] };
    try {
      say(`Creating ${f.name}…`); const made = await api('/centres', { method: 'POST', body: JSON.stringify({ ...f, name: f.name.trim(), adminEmail: f.adminEmail.trim().toLowerCase() }) }); const cid = made.centre.id; out.centre = made.centre; out.admin = made.admin;
      if (f.institutionType === 'school' && bells) { say('Setting the standard school timings…'); try { await api(`/timetable/periods?centreId=${cid}`, { method: 'PUT', body: JSON.stringify({ periods: standardBells() }) }); } catch { /* optional */ } }
      const chosen = items.filter((i) => i.include).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
      for (const it of chosen) {
        const recs = recordsOf(it); const label = kinds.find((k) => k.key === it.kind)?.label || it.kind; say(`Importing ${label} (${recs.length} rows) from ${it.file}…`);
        const agg = out.kinds[it.kind] || { label, created: 0, skipped: 0, errors: 0 };
        for (let i = 0; i < recs.length; i += 500) {
          const part = recs.slice(i, i + 500); const r = await api(`/import/commit?centreId=${cid}`, { method: 'POST', body: JSON.stringify({ kind: it.kind, rows: part, createClasses }) });
          agg.created += r.created; agg.skipped += r.skipped; agg.errors += r.errors; (r.newClasses || []).forEach((c: string) => { if (!out.classes.includes(c)) out.classes.push(c); });
          r.results.filter((x: any) => x.status === 'error').forEach((x: any) => out.problems.push({ kind: label, file: it.file, row: i + x.index + 1 + 1, reason: x.reason, data: part[x.index] }));
        }
        out.kinds[it.kind] = agg;
      }
      say('Done.'); setReport(out);
    } catch (e: any) { setErr(e.message + (out.centre ? ` (the client "${out.centre.name}" was already created; open it and use Import data to finish)` : '')); if (out.centre) setReport(out); } finally { setBusy(false); }
  }
  const dlProblems = () => { const head = ['List', 'File', 'Row in file', 'Problem', 'Name', 'Mobile']; const rows = report.problems.map((p: any) => [p.kind, p.file, p.row, p.reason, p.data?.name || p.data?.title || '', p.data?.parentMobile || p.data?.mobile || '']); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csvOf(head, rows)], { type: 'text/csv' })); a.download = `${report.centre.name}-rows-to-fix.csv`; a.click(); };
  const loginText = report ? `Login at ${LOGIN_URL}\nCoaching / school name: ${report.centre.name}\nEmail: ${report.admin.email}\nA one-time code (OTP) is sent to that email each time.` : '';

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold">Onboard a client</h1>
      <p className="text-sm text-slate-600 mt-1">For a school or coaching that is switching from another software. Enter their details, add the file(s) they exported from the old software, and press one button: NextEdge creates the client, the classes, the teachers and the students (parents get their logins).</p>
      {!report && <>
        <div className="card p-4 mt-4"><h2 className="font-semibold">1. Who is joining?</h2>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <L l="Type"><select className="input" value={f.institutionType} onChange={(e) => setF({ ...f, institutionType: e.target.value })}><option value="school">School</option><option value="coaching">Coaching centre</option></select></L>
            <L l="Name of the school / coaching *"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></L>
            <L l="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></L>
            <L l="Owner / principal name *"><input className="input" value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} /></L>
            <L l="Owner mobile (10 digits) *"><input className="input" maxLength={10} value={f.adminMobile} onChange={(e) => setF({ ...f, adminMobile: e.target.value.replace(/\D/g, '') })} /></L>
            <L l="Owner email (their login) *"><input className="input" type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} /></L>
            <L l="Pack"><select className="input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{planOptions(packs).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></L>
          </div><p className="text-xs text-slate-500 mt-2">A 30-day free trial starts now. The one-time login code goes to the owner's email.</p></div>

        <div className="card p-4 mt-4"><h2 className="font-semibold">2. Their data (optional but this is the point)</h2>
          <p className="text-sm text-slate-600">Add what the old software gave: an Excel workbook with several sheets, or separate Excel / CSV / Word / text-PDF files. NextEdge works out which list is which. Students need a parent mobile number; classes found in the file are created for you.</p>
          <input ref={pick} type="file" multiple className="hidden" accept=".xlsx,.csv,.tsv,.txt,.docx,.pdf" onChange={(e) => addFiles(e.target.files)} />
          <div className="mt-3 flex items-center gap-3 flex-wrap"><button className="btn-quiet" disabled={busy} onClick={() => pick.current?.click()}>{busy ? 'Reading…' : '+ Add file(s)'}</button><span className="text-sm text-slate-500">Excel (.xlsx), CSV, Word (.docx) or a PDF with selectable text. For a photo of a register, use Import data inside the client afterwards.</span></div>
          {err && <p className="text-brick text-sm mt-3">{err}</p>}
          {items.map((it) => { const recs = recordsOf(it); const good = validCount(it); const defs = kinds.find((k) => k.key === it.kind)?.fields || []; return (
            <div key={it.id} className={`border rounded p-3 mt-3 ${it.include ? 'border-teal-800' : 'border-slate-200 opacity-70'}`}>
              <div className="flex items-center gap-3 flex-wrap"><label className="flex items-center gap-2"><input type="checkbox" checked={it.include} onChange={(e) => setItems(items.map((c) => (c.id === it.id ? { ...c, include: e.target.checked } : c)))} /><b>{it.file}{it.sheet !== it.file ? ` · sheet "${it.sheet}"` : ''}</b></label>
                <span className="text-sm">looks like</span><select className="input py-1 w-52" value={it.kind} onChange={(e) => recheck(it, e.target.value)}>{kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
                <span className="tag">{it.total} rows</span><span className={`tag ${good === recs.length ? 'bg-moss text-white' : ''}`}>{good} ready</span>{recs.length - good > 0 && <span className="tag bg-brick text-white">{recs.length - good} will be skipped (no valid name/mobile)</span>}</div>
              {it.missing.length > 0 && <p className="text-sm text-brick mt-2">Could not find a column for: {it.missing.join(', ')}. Choose the right kind of list, or fix the file's header row.</p>}
              <p className="text-xs text-slate-600 mt-2">Columns understood: {Object.values(it.mapping).map((k: any) => defs.find((d: any) => d.key === k)?.label || k).join(', ') || 'none'}</p>
              <div className="overflow-x-auto mt-2"><table className="text-xs"><thead><tr>{Object.values(it.mapping).map((k: any, i) => <th key={i} className="th">{defs.find((d: any) => d.key === k)?.label || k}</th>)}</tr></thead><tbody>{recs.slice(0, 3).map((r: any, i: number) => <tr key={i}>{Object.keys(it.mapping).map((c, j) => <td key={j} className="td">{r[it.mapping[c]]}</td>)}</tr>)}</tbody></table></div>
            </div>); })}
        </div>

        <div className="card p-4 mt-4"><h2 className="font-semibold">3. Create everything</h2>
          <label className="block text-sm mt-2"><input type="checkbox" checked={createClasses} onChange={(e) => setCreateClasses(e.target.checked)} /> Create the classes and sections found in the student list (for example "VI-A", "6 A" and "Class 6 / A" become one class, 6-A).</label>
          {f.institutionType === 'school' && <label className="block text-sm mt-1"><input type="checkbox" checked={bells} onChange={(e) => setBells(e.target.checked)} /> Set standard school timings (8 periods and a lunch break; they can change it later).</label>}
          <div className="mt-4 flex items-center gap-3"><button className="btn" disabled={!ready || busy} onClick={run}>{busy ? 'Working…' : 'Create client and import'}</button>{!ready && <span className="text-sm text-slate-500">Fill the details in step 1 first.</span>}</div>
          {progress.length > 0 && <ul className="mt-3 text-sm text-slate-600 list-disc ml-5">{progress.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          {err && <p className="text-brick text-sm mt-3">{err}</p>}
        </div></>}

      {report && <div className="card p-5 mt-4"><h2 className="text-lg font-semibold text-moss">{report.centre.name} is ready</h2>
        <div className="grid grid-cols-3 gap-3 mt-3">{Object.values(report.kinds).map((k: any) => <div key={k.label} className="p-3 bg-slate-50 rounded"><div className="font-semibold">{k.label}</div><div className="text-sm">{k.created} added · {k.skipped} already there · {k.errors} to fix</div></div>)}{!Object.keys(report.kinds).length && <p className="text-sm text-slate-600 col-span-3">The client was created without data. Use Import data inside it to add students later.</p>}</div>
        {report.classes.length > 0 && <p className="text-sm mt-3"><b>{report.classes.length} classes created:</b> {report.classes.slice(0, 40).join(', ')}{report.classes.length > 40 ? '…' : ''}</p>}
        {report.problems.length > 0 && <div className="mt-3"><p className="text-sm text-brick font-medium">{report.problems.length} row(s) could not be added:</p><ul className="text-sm list-disc ml-5 text-brick">{report.problems.slice(0, 8).map((p: any, i: number) => <li key={i}>{p.file} row {p.row}: {p.reason}</li>)}</ul><button className="btn-quiet mt-2" onClick={dlProblems}>Download the rows to fix (CSV)</button></div>}
        <h3 className="font-semibold mt-5">Tell the owner</h3><pre className="text-sm bg-paper rounded p-3 whitespace-pre-wrap">{loginText}</pre>
        <div className="mt-3 flex gap-3"><button className="btn-quiet" onClick={() => navigator.clipboard?.writeText(loginText)}>Copy login instructions</button><button className="btn" onClick={() => { session.viewing({ id: report.centre.id, name: report.centre.name, institutionType: report.centre.institutionType }); location.assign('/'); }}>Open this client</button><button className="btn-quiet" onClick={() => { setReport(null); setItems([]); setProgress([]); setF({ ...f, name: '', city: '', adminName: '', adminMobile: '', adminEmail: '' }); }}>Onboard another</button></div></div>}
    </div>
  );
}
const L = ({ l, children }: any) => <div><label className="text-sm font-medium">{l}</label>{children}</div>;
