import { useEffect, useState } from 'react';
import { api, session } from '../api';
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
/** Shown to owners whose subscription is in grace/suspended (and reachable any time from Subscription → Pay). */
export default function PayWall() {
  const [w, setW] = useState<any>(null); const [ref, setRef] = useState(''); const [note, setNote] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { api('/payments/wall').then(setW).catch((e) => setMsg(e.message)); }, []);
  async function payu() { setMsg('Opening PayU…'); try { const f = await api('/payments/subscription/payu', { method: 'POST' }); const form = document.createElement('form'); form.method = 'POST'; form.action = f.action; Object.entries(f.fields).forEach(([k, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = String(v); form.appendChild(i); }); document.body.appendChild(form); form.submit(); } catch (e: any) { setMsg(e.message); } }
  async function claim() { setMsg(''); try { await api('/payments/subscription/claim', { method: 'POST', body: JSON.stringify({ reference: ref, note }) }); setMsg('Thanks — we will verify and activate your account shortly (usually within a few hours).'); setRef(''); } catch (e: any) { setMsg(e.message); } }
  if (!w) return <p className="p-8">{msg || 'Loading…'}</p>;
  const est = Math.max(w.minStudents, w.activeStudents) * w.pricePerStudent * (w.billingCycle === 'annual' ? 10 : 1); const amount = w.invoice ? Number(w.invoice.amount) : est;
  return (
    <div className="min-h-screen bg-teal-900 grid place-items-center p-6">
      <div className="card p-8 w-full max-w-2xl">
        <img src="/nextedge-logo.png" alt="NextEdge" className="h-10 mb-4" />
        <h1 className="text-2xl font-bold">{w.status === 'suspended' ? 'Your subscription has expired' : w.status === 'grace' ? 'Renew to keep full access' : 'Pay your subscription'}</h1>
        <p className="text-slate-600 mt-1">{w.activeStudents} active students × {inr(w.pricePerStudent)} per student per month{w.billingCycle === 'annual' ? ' × 10 (annual, 2 months free)' : ''}{w.activeStudents < w.minStudents ? ` (minimum ${w.minStudents} students billed)` : ''}</p>
        <div className="text-4xl font-bold my-4">{inr(amount)}</div>
        {w.invoice?.claimedRef && <div className="p-3 rounded bg-marigold-100 text-sm mb-4">Payment reference <b>{w.invoice.claimedRef}</b> submitted on {new Date(w.invoice.claimedAt).toLocaleString('en-IN')} — awaiting verification by NextEdge.</div>}
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-lg p-4"><h2 className="font-semibold">Pay online</h2><p className="text-sm text-slate-600 mt-1">UPI, cards, net banking via PayU. Activates instantly.</p><button className="btn mt-3 w-full justify-center" disabled={!w.payuAvailable} onClick={payu}>{w.payuAvailable ? `Pay ${inr(amount)} now` : 'Online payment not enabled yet'}</button></div>
          <div className="border border-slate-200 rounded-lg p-4"><h2 className="font-semibold">Pay manually</h2><p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{w.manualPayInfo || 'Ask NextEdge support for bank/UPI details.'}</p><label className="text-xs font-medium mt-3 block">UTR / transaction reference</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 4281xxxxxxxx" /><input className="input mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" /><button className="btn-quiet mt-2 w-full" disabled={!ref.trim()} onClick={claim}>I have paid — submit for verification</button></div>
        </div>
        {msg && <p className="text-sm mt-4">{msg}</p>}
        <div className="flex justify-between mt-6 text-sm"><a className="underline" href="/">Back to dashboard</a><button className="underline" onClick={() => { session.clear(); location.href = '/login'; }}>Log out</button></div>
      </div>
    </div>
  );
}
