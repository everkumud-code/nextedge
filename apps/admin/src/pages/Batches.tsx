import { useEffect, useState } from 'react';
import { api, session } from '../api';
/** Batches: list with student count, teachers and timetable slots; owner adds, edits, assigns teachers, archives. */
export default function Batches() {
  const [rows, setRows] = useState<any[]>([]); const [staff, setStaff] = useState<any[]>([]); const [form, setForm] = useState({ name: '', course: '', capacity: 60, startDate: '' }); const [err, setErr] = useState(''); const [edit, setEdit] = useState<any | null>(null); const [showArchived, setShowArchived] = useState(false);
  const owner = session.user?.role === 'ADMIN' || session.user?.role === 'SUPER_ADMIN';
  const load = () => { api(`/batches${showArchived ? '?all=1' : ''}`).then(setRows); if (owner) api('/staff').then((s) => setStaff(s.filter((x: any) => x.role === 'FACULTY' && x.active !== false))).catch(() => {}); };
  useEffect(() => { load(); }, [showArchived]);
  async function add() { setErr(''); try { await api('/batches', { method: 'POST', body: JSON.stringify({ ...form, startDate: form.startDate || undefined }) }); setForm({ name: '', course: '', capacity: 60, startDate: '' }); load(); } catch (e: any) { setErr(e.message); } }
  async function save() { try { await api(`/batches/${edit.id}`, { method: 'PUT', body: JSON.stringify({ name: edit.name, course: edit.course, capacity: Number(edit.capacity) }) }); setEdit(null); load(); } catch (e: any) { setErr(e.message); } }
  async function archive(b: any, v: boolean) { if (v && !confirm(`Archive "${b.name}"? Students stay linked; it is hidden from new work.`)) return; await api(`/batches/${b.id}`, { method: 'PUT', body: JSON.stringify({ archived: v }) }); load(); }
  async function addFaculty(b: any, facultyId: string) { if (!facultyId) return; const subject = prompt('Subject this teacher takes in ' + b.name + ' (optional)') || undefined; await api(`/batches/${b.id}/faculty`, { method: 'POST', body: JSON.stringify({ facultyId, subject }) }); load(); }
  async function removeFaculty(b: any, facultyId: string) { await api(`/batches/${b.id}/faculty/${facultyId}`, { method: 'DELETE' }); load(); }
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Batches</h1><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label></div>
      {owner && <div className="card p-4 mt-6 grid grid-cols-5 gap-3 items-end">
        <div className="col-span-2"><label className="text-sm font-medium">Batch name</label><input className="input" placeholder="Class 12 PCM - Morning" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Course</label><input className="input" placeholder="JEE Foundation" value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} /></div>
        <div><label className="text-sm font-medium">Capacity</label><input className="input" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
        <button className="btn" disabled={!form.name || !form.course} onClick={add}>Add batch</button>
      </div>}
      {err && <p className="text-brick text-sm mt-2">{err}</p>}
      <table className="card w-full mt-6"><thead><tr><th className="th">Batch</th><th className="th">Course</th><th className="th">Students</th><th className="th">Teachers</th><th className="th">Timetable</th>{owner && <th className="th"></th>}</tr></thead>
        <tbody>{rows.map((b) => <tr key={b.id} className={b.archived ? 'opacity-60' : ''}>
          <td className="td font-medium">{edit?.id === b.id ? <input className="input py-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /> : <>{b.name}{b.archived && <span className="tag ml-2">archived</span>}</>}</td>
          <td className="td">{edit?.id === b.id ? <input className="input py-1" value={edit.course} onChange={(e) => setEdit({ ...edit, course: e.target.value })} /> : b.course}</td>
          <td className="td">{b.students} / {edit?.id === b.id ? <input className="input py-1 w-20 inline-block" type="number" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} /> : b.capacity}{b.students > b.capacity && <span className="text-brick"> over capacity</span>}</td>
          <td className="td">{b.faculty.map((f: any) => <span key={f.facultyId} className="tag mr-1">{f.name}{f.subject ? ` · ${f.subject}` : ''}{owner && <button className="ml-1 text-brick" title="Remove" onClick={() => removeFaculty(b, f.facultyId)}>×</button>}</span>)}
            {owner && !b.archived && <select className="input py-1 inline-block w-40 mt-1" value="" onChange={(e) => addFaculty(b, e.target.value)}><option value="">+ assign teacher</option>{staff.filter((s) => !b.faculty.some((f: any) => f.facultyId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</td>
          <td className="td">{b.slots} slot{b.slots === 1 ? '' : 's'}/week</td>
          {owner && <td className="td whitespace-nowrap">{edit?.id === b.id ? <><button className="btn sm" onClick={save}>Save</button> <button className="btn-quiet" onClick={() => setEdit(null)}>Cancel</button></> : <><button className="btn-quiet" onClick={() => setEdit({ id: b.id, name: b.name, course: b.course, capacity: b.capacity })}>Edit</button> <button className="btn-quiet" onClick={() => archive(b, !b.archived)}>{b.archived ? 'Restore' : 'Archive'}</button></>}</td>}
        </tr>)}</tbody></table>
      {rows.length === 0 && <p className="text-sm text-slate-500 mt-3">No batches yet — add the first one above, then add students to it.</p>}
    </div>
  );
}
