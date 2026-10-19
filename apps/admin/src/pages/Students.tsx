import { useEffect, useState } from 'react';
import { api } from '../api';
import * as XLSX from 'xlsx';
const empty = { name: '', className: '', rollNo: '', parentName: '', parentMobile: '', parentEmail: '', batchId: '', dob: '' };
export default function Students() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [form, setForm] = useState(empty); const [err, setErr] = useState(''); const [q, setQ] = useState('');
  const [preview, setPreview] = useState<any[]>([]); const [impBatch, setImpBatch] = useState(''); const [impMsg, setImpMsg] = useState('');
  const load = () => api('/students').then(setRows); useEffect(() => { load(); api('/batches').then(setBatches); }, []);
  async function add() { setErr(''); try { await api('/students', { method: 'POST', body: JSON.stringify({ ...form, batchId: form.batchId || undefined, dob: form.dob || undefined }) }); setForm(empty); load(); } catch (e: any) { setErr(e.message); } }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const wb = XLSX.read(r.result, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const pick = (row: any, ...keys: string[]) => { const k = Object.keys(row).find((h) => keys.some((x) => h.toLowerCase().replace(/[^a-z]/g, '').includes(x))); return k ? String(row[k]).trim() : ''; };
      setPreview(raw.map((row) => ({ name: pick(row, 'studentname', 'name'), rollNo: pick(row, 'roll'), className: pick(row, 'class', 'std'), parentName: pick(row, 'parentname', 'father', 'guardian'), parentMobile: pick(row, 'parentmobile', 'mobile', 'phone', 'contact').replace(/\D/g, '').slice(-10), mobile: pick(row, 'studentmobile'), parentEmail: pick(row, 'email') })));
      setImpMsg('');
    };
    r.readAsArrayBuffer(f);
  }
  async function confirmImport() {
    setImpMsg('Importing…');
    try { const r = await api('/students/import', { method: 'POST', body: JSON.stringify({ rows: preview, batchId: impBatch || undefined }) });
      setImpMsg(`${r.created} students added${r.skipped.length ? `, ${r.skipped.length} skipped: ` + r.skipped.map((s: any) => `row ${s.row} (${s.reason})`).join('; ') : ''}`); setPreview([]); load(); }
    catch (e: any) { setImpMsg(e.message); }
  }
  const batchName = (id: string) => batches.find((b) => b.id === id)?.name ?? '—';
  const shown = rows.filter((s) => s.active && (s.name + s.parentMobile + (s.rollNo || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Students</h1><input className="input w-64" placeholder="Search name, roll no, mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card p-4 mt-6 grid grid-cols-6 gap-3 items-end">
        <F label="Student name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
        <F label="Class"><input className="input" placeholder="12" value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></F>
        <F label="Roll no"><input className="input" value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} /></F>
        <F label="Parent name"><input className="input" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></F>
        <F label="Parent mobile"><input className="input" maxLength={10} value={form.parentMobile} onChange={(e) => setForm({ ...form, parentMobile: e.target.value.replace(/\D/g, '') })} /></F>
        <F label="Date of birth (for wishes)"><input className="input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></F>
        <F label="Parent email (for email OTP)"><input className="input" type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} /></F>
        <F label="Batch"><select className="input" value={form.batchId} onChange={(e) => setForm({ ...form, batchId: e.target.value })}><option value="">Not assigned</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
        <div className="col-span-6"><button className="btn" disabled={!form.name || form.parentMobile.length !== 10} onClick={add}>Add student</button>{err && <span className="text-brick text-sm ml-4">{err}</span>}</div>
      </div>
      <div className="card p-4 mt-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div><div className="font-semibold">Import from Excel</div><div className="text-sm text-slate-600">Columns: Name, Roll No, Class, Parent Name, Parent Mobile, Email (any order; extra columns ignored)</div></div>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="text-sm" />
          <select className="input w-56" value={impBatch} onChange={(e) => setImpBatch(e.target.value)}><option value="">Batch: not assigned</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
        {preview.length > 0 && <>
          <table className="w-full mt-4 text-sm"><thead><tr><th className="th">Name</th><th className="th">Roll</th><th className="th">Class</th><th className="th">Parent</th><th className="th">Parent mobile</th></tr></thead>
            <tbody>{preview.slice(0, 50).map((r, i) => <tr key={i} className={r.parentMobile.length !== 10 || !r.name ? 'text-brick' : ''}><td className="td">{r.name || '(missing)'}</td><td className="td">{r.rollNo}</td><td className="td">{r.className}</td><td className="td">{r.parentName}</td><td className="td">{r.parentMobile || '(missing)'}</td></tr>)}</tbody></table>
          <div className="flex items-center gap-3 mt-3"><button className="btn" onClick={confirmImport}>Import {preview.length} students</button><button className="btn-quiet" onClick={() => setPreview([])}>Cancel</button>{preview.length > 50 && <span className="text-sm text-slate-500">showing first 50</span>}</div>
        </>}
        {impMsg && <p className="text-sm mt-3">{impMsg}</p>}
      </div>
      <table className="card w-full mt-6"><thead><tr><th className="th">Roll</th><th className="th">Name</th><th className="th">Class</th><th className="th">Batch</th><th className="th">Parent</th><th className="th">Parent mobile</th></tr></thead>
        <tbody>{shown.map((s) => <tr key={s.id}><td className="td">{s.rollNo || '—'}</td><td className="td font-medium">{s.name}</td><td className="td">{s.className || '—'}</td><td className="td">{batchName(s.batchId)}</td><td className="td">{s.parentName || '—'}</td><td className="td">{s.parentMobile}</td></tr>)}
          {shown.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>No students match.</td></tr>}</tbody></table>
    </div>
  );
}
function F({ label, children }: { label: string; children: React.ReactNode }) { return <div><label className="text-sm font-medium">{label}</label>{children}</div>; }
