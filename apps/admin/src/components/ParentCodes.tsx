import { useState } from 'react';
import { api } from '../api';

type Parent = { mobile: string; parentName: string; children: string[]; code: string; message: string };
type Result = { school: string; link: string; validHours: number; parents: Parent[] };

/**
 * Parent login codes: the school office makes a 6-digit code for a parent (one student, several, or a whole class).
 * The parent signs in with the mobile number the school has and this code: no SMS or WhatsApp provider needed.
 * The codes are shown once here (they cannot be looked up later); send them by WhatsApp, read them out, or print the sheet.
 */
export default function ParentCodes({ ids, batchId, label = 'Parent login codes' }: { ids?: string[]; batchId?: string; label?: string }) {
  const [res, setRes] = useState<Result | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [copied, setCopied] = useState('');

  async function make() {
    setBusy(true); setErr('');
    try { setRes(await api('/students/parent-codes', { method: 'POST', body: JSON.stringify({ studentIds: ids && ids.length ? ids : undefined, batchId }) })); }
    catch (e: any) { setErr(e.message); alert(e.message); } finally { setBusy(false); }
  }
  const copy = async (text: string, key: string) => { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { alert('Copy failed. Select the message and copy it by hand.'); } };

  return <>
    <button type="button" className="btn-quiet" disabled={busy} onClick={make}>{busy ? 'Making codes…' : label}</button>
    {res && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
      <div className="card bg-white w-full max-w-4xl max-h-[90vh] overflow-auto p-5 print:max-h-none print:shadow-none print:border-0">
        <div className="flex justify-between items-start gap-3 print:hidden">
          <div><h2 className="font-semibold text-lg">Parent login codes</h2><p className="text-sm text-slate-600">Give each parent the code. They sign in at <b>{res.link}</b> with their mobile number and the code. Each code works <b>once</b> and lasts <b>{res.validHours} hours</b>. They are shown only now.</p></div>
          <div className="flex gap-2"><button className="btn" onClick={() => window.print()}>Print sheet</button><button className="btn-quiet" onClick={() => setRes(null)}>Close</button></div>
        </div>
        <div className="hidden print:block mb-3"><h2 className="text-xl font-bold">{res.school}: parent login codes</h2><p className="text-sm">Sign in at {res.link} with the mobile number and the code below. A code works once and lasts {res.validHours} hours. Please do not share it.</p></div>
        {err && <p className="text-brick text-sm">{err}</p>}
        <table className="w-full text-sm mt-3"><thead><tr className="text-left text-slate-500 border-b"><th className="py-1.5 pr-3">Parent</th><th className="pr-3">Children</th><th className="pr-3">Mobile</th><th className="pr-3">Code</th><th className="print:hidden"></th></tr></thead>
          <tbody>{res.parents.map((p) => <tr key={p.mobile} className="border-b border-slate-100 align-top"><td className="py-2 pr-3">{p.parentName}</td><td className="pr-3">{p.children.join(', ')}</td><td className="pr-3 font-mono">{p.mobile}</td><td className="pr-3 font-mono text-base font-bold tracking-widest">{p.code}</td>
            <td className="whitespace-nowrap print:hidden"><button className="btn-quiet" onClick={() => copy(p.message, p.mobile)}>{copied === p.mobile ? 'Copied' : 'Copy message'}</button> <a className="btn-quiet" target="_blank" rel="noreferrer" href={`https://wa.me/91${p.mobile}?text=${encodeURIComponent(p.message)}`}>WhatsApp</a></td></tr>)}</tbody></table>
      </div>
    </div>}
  </>;
}
