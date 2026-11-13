import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { canDownload, api, session } from '../api';

const blank = () => ({ name: '', batchId: '', rollNo: '', dob: '', gender: '', parentName: '', fatherName: '', motherName: '', parentMobile: '', parentEmail: '', mobile: '', email: '', address: '', category: '', religion: '', bloodGroup: '', previousSchool: '', admissionNo: '', className: '', apaarId: '', pen: '', photoConsent: '' });
const PAGE = 50;
// Defined outside the screen component on purpose: a component created inside another one is rebuilt on every keystroke and the typing box loses focus.
const F = ({ label, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{label}</label>{children}</div>;

/** Students: search + filters, bulk move/deactivate, add/edit with full profile, Excel import with preview, CSV export, link to the 360° profile. */
export default function Students() {
  const school = session.user?.institutionType === 'school';
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [q, setQ] = useState(''); const [batchF, setBatchF] = useState(''); const [statusF, setStatusF] = useState('active'); const [genderF, setGenderF] = useState(''); const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [form, setForm] = useState<any | null>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const [moveTo, setMoveTo] = useState('');
  const [preview, setPreview] = useState<any[]>([]); const [impBatch, setImpBatch] = useState(''); const [impMsg, setImpMsg] = useState(''); const [showImport, setShowImport] = useState(false);
  const load = () => api('/students').then(setRows); useEffect(() => { load(); api('/batches').then(setBatches); }, []);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '—';
  const filtered = useMemo(() => rows.filter((s) => (statusF === 'all' || (statusF === 'active' ? s.active : !s.active)) && (!batchF || s.batchId === batchF) && (!genderF || s.gender === genderF) && (!q || `${s.name} ${s.parentMobile} ${s.rollNo || ''} ${s.admissionNo || ''} ${s.parentName || ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => bn(a.batchId).localeCompare(bn(b.batchId)) || (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0) || a.name.localeCompare(b.name)), [rows, q, batchF, statusF, genderF, batches]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)); const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => setPage(0), [q, batchF, statusF, genderF]);
  const activeCount = rows.filter((s) => s.active).length;
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const allOnPage = shown.length > 0 && shown.every((s) => sel.has(s.id));

  async function save() {
    setErr(''); try {
      const body: any = { ...form }; const pc = form.photoConsent; Object.keys(body).forEach((k) => body[k] === '' && delete body[k]); body.photoConsent = pc === 'yes' || pc === true ? true : pc === 'no' || pc === false ? false : null; const id = form.id; delete body.id;
      if (id) { ['createdAt', 'centreId', 'userId', 'active', 'leftOn', 'leftReason', 'photoUrl', 'admissionDate', 'className'].forEach((k) => delete body[k]); ['parentEmail', 'email', 'dob', 'gender', 'fatherName', 'motherName', 'address', 'category', 'religion', 'bloodGroup', 'previousSchool', 'mobile', 'parentName', 'apaarId', 'pen'].forEach((k) => { if (form[k] === '' ) body[k] = ''; }); await api(`/students/${id}`, { method: 'PUT', body: JSON.stringify(body) }); setMsg('Student updated'); }
      else { await api('/students', { method: 'POST', body: JSON.stringify(body) }); setMsg(`${form.name} added — parent login created`); }
      setForm(null); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function bulkMove() { if (!moveTo) return; const r = await api(`/batches/${moveTo}/move`, { method: 'POST', body: JSON.stringify({ studentIds: [...sel] }) }); setMsg(`Moved ${r.moved} students to ${bn(moveTo)}`); setSel(new Set()); setMoveTo(''); load(); }
  async function bulkDeactivate() { if (!confirm(`Deactivate ${sel.size} students? They stop appearing in attendance, fees and lists (records are kept).`)) return; for (const id of sel) await api(`/students/${id}`, { method: 'DELETE' }); setMsg(`${sel.size} students deactivated`); setSel(new Set()); load(); }
  async function reactivate(s: any) { await api(`/students/${s.id}`, { method: 'PUT', body: JSON.stringify({ active: true, leftOn: '', leftReason: '' }) }); load(); }
  function exportCsv() { const head = ['Roll', 'Name', 'Class/section', 'Gender', 'DOB', 'Admission no', 'Parent', 'Parent mobile', 'Address', 'Status']; const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`; const lines = [head.map(esc).join(','), ...filtered.map((s) => [s.rollNo, s.name, bn(s.batchId), s.gender, s.dob, s.admissionNo, s.parentName || s.fatherName, s.parentMobile, s.address, s.active ? 'Active' : 'Left'].map(esc).join(','))]; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' })); a.download = 'students.csv'; a.click(); }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; const r = new FileReader();
    r.onload = () => {
      const wb = XLSX.read(r.result, { type: 'array' }); const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const pick = (row: any, ...keys: string[]) => { const k = Object.keys(row).find((h) => keys.some((x) => h.toLowerCase().replace(/[^a-z]/g, '') === x || h.toLowerCase().replace(/[^a-z]/g, '').includes(x))); return k ? String(row[k]).trim() : ''; };
      const dt = (v: string) => { if (!v) return ''; const d = new Date(v); return isNaN(+d) ? (/^\d{2}[-/]\d{2}[-/]\d{4}$/.test(v) ? v.split(/[-/]/).reverse().join('-') : '') : d.toISOString().slice(0, 10); };
      setPreview(raw.map((row) => ({ name: pick(row, 'studentname', 'name'), rollNo: pick(row, 'roll'), className: pick(row, 'class', 'std'), parentName: pick(row, 'parentname', 'guardian'), fatherName: pick(row, 'fathername', 'father'), motherName: pick(row, 'mothername', 'mother'), parentMobile: pick(row, 'parentmobile', 'guardianmobile', 'fathermobile', 'mobile', 'phone', 'contact').replace(/\D/g, '').slice(-10), parentEmail: pick(row, 'parentemail', 'email'), gender: pick(row, 'gender', 'sex'), dob: dt(pick(row, 'dob', 'dateofbirth', 'birth')), address: pick(row, 'address'), category: pick(row, 'category', 'caste'), religion: pick(row, 'religion'), bloodGroup: pick(row, 'blood'), admissionNo: pick(row, 'admissionno', 'admno', 'admission'), previousSchool: pick(row, 'previousschool', 'lastschool') })));
      setImpMsg('');
    }; r.readAsArrayBuffer(f);
  }
  async function confirmImport() { setImpMsg('Importing…'); try { const r = await api('/students/import', { method: 'POST', body: JSON.stringify({ rows: preview, batchId: impBatch || undefined }) }); setImpMsg(`${r.created} students added${r.skipped.length ? `, ${r.skipped.length} skipped: ` + r.skipped.slice(0, 15).map((s: any) => `row ${s.row} (${s.reason})`).join('; ') : ''}`); setPreview([]); load(); } catch (e: any) { setImpMsg(e.message); } }
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: k === 'parentMobile' || k === 'mobile' ? e.target.value.replace(/\D/g, '') : e.target.value });
  const bad = (r: any) => !r.name || r.parentMobile.length !== 10;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold">Students</h1><p className="text-sm text-slate-600">{activeCount} active{rows.length - activeCount > 0 ? ` · ${rows.length - activeCount} left/inactive` : ''}</p></div>
        <div className="flex gap-2"><button className="btn" onClick={() => setForm(blank())}>+ Add student</button><button className="btn-quiet" onClick={() => setShowImport(!showImport)}>Import from Excel</button>{canDownload() && <button className="btn-quiet" onClick={exportCsv}>Export</button>}</div></div>
      <div className="flex gap-3 mt-4 flex-wrap items-center">
        <input className="input w-72" placeholder="Search name, roll, admission no, parent, mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-52" value={batchF} onChange={(e) => setBatchF(e.target.value)}><option value="">{school ? 'All classes' : 'All batches'}</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="input w-36" value={statusF} onChange={(e) => setStatusF(e.target.value)}><option value="active">Active</option><option value="left">Left / inactive</option><option value="all">All</option></select>
        {school && <select className="input w-32" value={genderF} onChange={(e) => setGenderF(e.target.value)}><option value="">Any gender</option><option>Male</option><option>Female</option></select>}
        <span className="text-sm text-slate-500 ml-auto">{filtered.length} shown</span>
      </div>
      {msg && <p className="text-sm mt-2 text-moss">{msg}</p>}
      {sel.size > 0 && <div className="card p-3 mt-3 flex items-center gap-3 flex-wrap bg-edge-100"><b>{sel.size} selected</b><select className="input w-52 py-1" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}><option value="">Move to…</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="btn sm" disabled={!moveTo} onClick={bulkMove}>Move</button><button className="btn-quiet" onClick={bulkDeactivate}>Deactivate</button><button className="underline text-sm ml-auto" onClick={() => setSel(new Set())}>Clear</button></div>}

      {showImport && <div className="card p-4 mt-4">
        <div className="flex items-center gap-4 flex-wrap"><div><div className="font-semibold">Import from Excel / CSV</div><div className="text-sm text-slate-600">Columns (any order): Name, Roll No, Class, Father, Mother, Parent Mobile, Email, Gender, DOB, Address, Category, Religion, Blood Group, Admission No. Extra columns are ignored.</div></div><input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="text-sm" /><select className="input w-56" value={impBatch} onChange={(e) => setImpBatch(e.target.value)}><option value="">{school ? 'Class' : 'Batch'}: not assigned</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        {preview.length > 0 && <><div className="text-sm mt-3"><b>{preview.length}</b> rows read · <span className="text-brick">{preview.filter(bad).length} have problems (shown in red) and will be skipped</span></div>
          <div className="overflow-x-auto"><table className="w-full mt-2 text-sm"><thead><tr><th className="th">Name</th><th className="th">Roll</th><th className="th">Father</th><th className="th">Parent mobile</th><th className="th">Email</th><th className="th">Gender</th><th className="th">DOB</th></tr></thead><tbody>{preview.slice(0, 40).map((r, i) => <tr key={i} className={bad(r) ? 'text-brick' : ''}><td className="td">{r.name || '(missing)'}</td><td className="td">{r.rollNo}</td><td className="td">{r.fatherName || r.parentName}</td><td className="td">{r.parentMobile || '(missing)'}</td><td className="td">{r.parentEmail}</td><td className="td">{r.gender}</td><td className="td">{r.dob}</td></tr>)}</tbody></table></div>
          <button className="btn mt-3" onClick={confirmImport}>Import {preview.filter((r) => !bad(r)).length} students</button></>}
        {impMsg && <p className="text-sm mt-2">{impMsg}</p>}
      </div>}

      <div className="card mt-4 overflow-x-auto"><table className="w-full"><thead><tr><th className="th w-8"><input type="checkbox" checked={allOnPage} onChange={() => { const n = new Set(sel); shown.forEach((s) => (allOnPage ? n.delete(s.id) : n.add(s.id))); setSel(n); }} /></th><th className="th">Roll</th><th className="th">Student</th><th className="th">{school ? 'Class & section' : 'Batch'}</th>{school && <th className="th">Adm. no</th>}<th className="th">Parent</th><th className="th">Login</th><th className="th"></th></tr></thead>
        <tbody>{shown.map((s) => <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
          <td className="td"><input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td><td className="td text-slate-500">{s.rollNo || '—'}</td>
          <td className="td"><Link to={`/students/${s.id}`} className="font-medium hover:underline">{s.name}</Link>{!s.active && <span className="tag ml-2">left</span>}<div className="text-xs text-slate-500">{[s.gender, s.dob && new Date(s.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</div></td>
          <td className="td">{bn(s.batchId)}</td>{school && <td className="td text-xs">{s.admissionNo || '—'}</td>}
          <td className="td text-sm">{s.parentName || s.fatherName || '—'}<div className="text-xs"><a className="underline" href={`tel:${s.parentMobile}`}>{s.parentMobile}</a></div></td>
          <td className="td text-xs">{s.userId ? 'Student + parent' : 'Parent'}</td>
          <td className="td whitespace-nowrap"><Link className="btn-quiet" to={`/students/${s.id}`}>Profile</Link> <button className="btn-quiet" onClick={() => setForm({ ...blank(), ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? ''])) })}>Edit</button>{!s.active && <button className="btn-quiet" onClick={() => reactivate(s)}>Reactivate</button>}</td></tr>)}
          {shown.length === 0 && <tr><td className="td text-slate-500" colSpan={8}>{rows.length === 0 ? 'No students yet — add the first one or import an Excel sheet.' : 'No students match these filters.'}</td></tr>}</tbody></table></div>
      {pages > 1 && <div className="flex items-center gap-3 mt-3 text-sm"><button className="btn-quiet" disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button><span>Page {page + 1} of {pages}</span><button className="btn-quiet" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next →</button></div>}

      {form && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setForm(null)}><div className="card p-5 w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3"><h2 className="font-semibold text-lg">{form.id ? `Edit — ${form.name}` : 'Add student'}</h2><button className="btn-quiet" onClick={() => setForm(null)}>Close</button></div>
        <div className="grid grid-cols-4 gap-3">
          <F label="Student name *" span={2}><input className="input" value={form.name} onChange={set('name')} autoFocus /></F>
          <F label={school ? 'Class & section' : 'Batch'}><select className="input" value={form.batchId} onChange={set('batchId')}><option value="">Not assigned</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></F>
          <F label="Roll no (auto if blank)"><input className="input" value={form.rollNo} onChange={set('rollNo')} /></F>
          <F label="Date of birth"><input className="input" type="date" value={form.dob || ''} onChange={set('dob')} /></F>
          <F label="Gender"><select className="input" value={form.gender} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></F>
          <F label="Blood group"><select className="input" value={form.bloodGroup} onChange={set('bloodGroup')}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map((b) => <option key={b}>{b}</option>)}</select></F>
          {school && <F label="Admission no (auto if blank)"><input className="input" value={form.admissionNo} onChange={set('admissionNo')} /></F>}
          <F label="Father’s name"><input className="input" value={form.fatherName} onChange={set('fatherName')} /></F>
          <F label="Mother’s name"><input className="input" value={form.motherName} onChange={set('motherName')} /></F>
          <F label="Parent mobile * (login)"><input className="input" maxLength={10} value={form.parentMobile} onChange={set('parentMobile')} /></F>
          <F label="Parent email * (login)"><input className="input" type="email" value={form.parentEmail || ''} onChange={set('parentEmail')} /></F>
          <F label="Student mobile (own login)"><input className="input" maxLength={10} value={form.mobile || ''} onChange={set('mobile')} /></F>
          <F label="Student email (own login)"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></F>
          {school && <><F label="Category"><select className="input" value={form.category} onChange={set('category')}><option value="">—</option>{['General', 'OBC', 'SC', 'ST', 'EWS'].map((c) => <option key={c}>{c}</option>)}</select></F><F label="Religion"><input className="input" value={form.religion} onChange={set('religion')} /></F><F label="Previous school" span={2}><input className="input" value={form.previousSchool} onChange={set('previousSchool')} /></F><F label="APAAR ID (12 digits)" span={2}><input className="input" inputMode="numeric" placeholder="or write: refused / not generated" value={form.apaarId || ''} onChange={set('apaarId')} /></F><F label="PEN (11 digits)" span={2}><input className="input" inputMode="numeric" value={form.pen || ''} onChange={set('pen')} /></F><F label="Photo may be shown (events, notices, website)" span={4}><select className="input" value={form.photoConsent === true ? 'yes' : form.photoConsent === false ? 'no' : form.photoConsent || ''} onChange={set('photoConsent')}><option value="">Not asked yet</option><option value="yes">Yes — parent agreed</option><option value="no">No — parent refused</option></select></F></>}
          <F label="Address" span={4}><input className="input" value={form.address} onChange={set('address')} /></F>
        </div>
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="flex gap-2 mt-4"><button className="btn" disabled={!form.name || form.parentMobile.length !== 10 || (!form.id && !String(form.parentEmail).includes('@'))} onClick={save}>{form.id ? 'Save changes' : 'Add student'}</button><button className="btn-quiet" onClick={() => setForm(null)}>Cancel</button></div>
        <p className="text-xs text-slate-500 mt-2">The parent logs in with the email above. Class, roll number and admission number are filled automatically when left blank.</p>
      </div></div>}
    </div>
  );
}
