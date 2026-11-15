import { useEffect, useState } from 'react';
import { api, canDelete } from '../api';

const NICE: Record<string, string> = {
  students: 'Student', batches: 'Class / batch', fee_payments: 'Fee receipt', student_fee_plans: 'Fee plan of a student', fee_plans: 'Fee plan', exams: 'Exam', exam_marks: 'Exam marks',
  records: 'Record', files: 'File / photo', content: 'Study material', houses: 'House', house_points: 'House points', house_roles: 'House role',
  timetable_slots: 'Timetable period', substitutions: 'Substitution', faculty_batches: 'Teacher of a class', biometric_devices: 'Biometric machine',
};
const when = (v: any) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Platform owner and team: everything that was deleted, kept safe. Restore it, or (owner only) approve erasing it for good. */
export default function RecycleBin() {
  const [status, setStatus] = useState<'pending' | 'restored' | 'erased'>('pending'); const [list, setList] = useState<any[] | null>(null); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const load = () => { setList(null); api(`/recycle-bin?status=${status}`).then(setList).catch((e) => { setErr(e.message); setList([]); }); };
  useEffect(load, [status]);
  async function restore(g: any) {
    setBusy(g.tx); setErr(''); setMsg('');
    try { const r = await api('/recycle-bin/restore', { method: 'POST', body: JSON.stringify({ tx: g.tx }) }); setMsg(r.failed ? `Brought back ${r.restored}, but ${r.failed} could not be placed${r.error ? ` (${r.error})` : ''}. Restore the item they belong to first, then try again.` : `Brought back ${r.restored} item${r.restored === 1 ? '' : 's'}.`); load(); } catch (e: any) { setErr(e.message); }
    setBusy('');
  }
  async function erase(g: any) {
    const typed = prompt('This erases it for good and cannot be undone.\nType ERASE to approve:'); if (typed !== 'ERASE') return;
    setBusy(g.tx); setErr(''); setMsg('');
    try { const r = await api('/recycle-bin/erase', { method: 'POST', body: JSON.stringify({ tx: g.tx, confirm: 'ERASE' }) }); setMsg(`Erased for good (${r.erased}).`); load(); } catch (e: any) { setErr(e.message); }
    setBusy('');
  }
  return (
    <div>
      <h1 className="text-2xl font-bold">Recycle bin</h1>
      <p className="text-sm text-slate-600 mt-1">Everything that is deleted is kept here. Nothing is erased for good until the platform owner approves it, and anything can be brought back.</p>
      <div className="flex gap-2 mt-4">{([['pending', 'Waiting for approval'], ['restored', 'Brought back'], ['erased', 'Erased for good']] as const).map(([k, label]) => <button key={k} type="button" data-testid={`bin-tab-${k}`} aria-pressed={status === k} onClick={() => setStatus(k)} className={status === k ? 'btn sm' : 'btn-quiet'}>{label}</button>)}</div>
      {msg && <div className="mt-3 p-2.5 rounded bg-edge-100 text-sm" role="status">{msg}</div>}
      {err && <div className="mt-3 p-2.5 rounded bg-red-50 text-brick text-sm" role="alert">{err}</div>}
      {list === null ? <p className="mt-6 text-sm text-slate-500">Loading…</p> : !list.length ? <p className="mt-6 text-sm text-slate-500">{status === 'pending' ? 'Nothing is waiting. Nothing has been deleted.' : 'Nothing here yet.'}</p> : (
        <div className="mt-4 space-y-3">
          {list.map((g) => {
            const first = g.items.slice(0, 3).map((i: any) => i.label).filter(Boolean).join(', '); const kinds = [...new Set(g.items.map((i: any) => NICE[i.table] || i.table))].join(' · ');
            return (
              <div key={g.tx} data-testid="bin-item" className="card p-4 flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{kinds}{g.items.length > 1 ? ` (${g.items.length} items)` : ''}</div>
                  <div className="text-sm text-slate-700 mt-0.5 break-words">{first}{g.items.length > 3 ? ` and ${g.items.length - 3} more` : ''}</div>
                  <div className="text-xs text-slate-500 mt-1">{g.centreName ? `${g.centreName} · ` : ''}Deleted {when(g.deletedAt)}{g.by ? ` by ${g.by}` : ''}{g.decidedAt ? ` · ${status === 'erased' ? 'erased' : 'brought back'} ${when(g.decidedAt)}${g.decidedBy ? ` by ${g.decidedBy}` : ''}` : ''}</div>
                </div>
                {status === 'pending' && <div className="flex gap-2 shrink-0">
                  <button type="button" className="btn sm" disabled={busy === g.tx} onClick={() => restore(g)}>Restore</button>
                  {canDelete() && <button type="button" className="btn-quiet text-brick" disabled={busy === g.tx} onClick={() => erase(g)}>Erase for good…</button>}
                </div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
