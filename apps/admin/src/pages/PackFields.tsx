import { useEffect, useState } from 'react';
import { api } from '../api';

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
export const packLabel = (packs: any[], key: string) => (key === 'demo' ? 'Demo package' : packs.find((p) => p.key === key)?.name || key);
/** Plan choices for a dropdown: the three Edge packs, then the free demo package. */
export const planOptions = (packs: any[]) => [...packs.map((p) => ({ key: p.key, label: `${p.name} · ${p.key === 'core' ? `${inr(p.pricePerStudent)} per student / month` : p.key === 'pro' ? `setup ${inr(p.setupFee)} + ${inr(p.yearlyPrice)} / year` : 'custom price'}` })), { key: 'demo', label: 'Demo package · all features, free, no expiry' }];
/** One line describing what a client pays. */
export const packSummary = (c: any, packs: any[]) => { const s = c.settings || c; const p = c.plan || s.plan;
  if (p === 'pro') return `setup ${inr(s.setupFee)}${s.setupPaid ? ' (paid)' : ''} + ${inr(s.yearlyPrice)}/year`;
  if (p === 'elite') return `${inr(s.customAmount)} ${s.customCycle || 'yearly'}${Number(s.setupFee) ? ` + setup ${inr(s.setupFee)}${s.setupPaid ? ' (paid)' : ''}` : ''}`;
  return `${inr(Number(s.pricePerStudent))}/student/month${s.minStudents ? ` · min ${s.minStudents}` : ''}`; };

const L = ({ l, children }: any) => <div><label className="text-sm font-medium">{l}</label>{children}</div>;

/** The plan dropdown and the price fields that belong to that plan (used when editing a client). */
export function PlanFields({ edit, setEdit, packs }: any) {
  const set = (k: string, v: any) => setEdit({ ...edit, [k]: v });
  function pick(key: string) { const p = packs.find((x: any) => x.key === key); const base: any = { plan: key }; if (key === 'core' && p) Object.assign(base, { price: String(Number(p.pricePerStudent)), minStudents: String(p.minStudents), billingCycle: 'monthly' }); if (key === 'pro' && p) Object.assign(base, { setupFee: String(Number(p.setupFee)), yearlyPrice: String(Number(p.yearlyPrice)), setupPaid: false, billingCycle: 'annual' }); if (key === 'elite' && p) Object.assign(base, { setupFee: String(Number(p.setupFee)), customAmount: '0', customCycle: 'yearly', setupPaid: false, billingCycle: 'annual' }); setEdit({ ...edit, ...base }); }
  return (<>
    <L l="Plan (changing resets modules and prices)"><select className="input" value={edit.plan} onChange={(e) => pick(e.target.value)}>{planOptions(packs).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></L>
    {edit.plan === 'core' && <>
      <L l="Price per student / month (₹)"><input className="input" type="number" min={0} value={edit.price} onChange={(e) => set('price', e.target.value)} /></L>
      <L l="Minimum students billed"><input className="input" type="number" min={0} value={edit.minStudents} onChange={(e) => set('minStudents', e.target.value)} /></L>
      <L l="Billing"><select className="input" value={edit.billingCycle} onChange={(e) => set('billingCycle', e.target.value)}><option value="monthly">Monthly</option><option value="annual">Annual (2 months free)</option></select></L></>}
    {edit.plan === 'pro' && <>
      <L l="One-time setup cost (₹)"><input className="input" type="number" min={0} value={edit.setupFee} onChange={(e) => set('setupFee', e.target.value)} /></L>
      <L l="Yearly package (₹ / year)"><input className="input" type="number" min={0} value={edit.yearlyPrice} onChange={(e) => set('yearlyPrice', e.target.value)} /></L>
      <L l="Setup already paid?"><select className="input" value={edit.setupPaid ? 'yes' : 'no'} onChange={(e) => set('setupPaid', e.target.value === 'yes')}><option value="no">No: add it to the first invoice</option><option value="yes">Yes: do not bill it again</option></select></L></>}
    {edit.plan === 'elite' && <>
      <L l="Custom amount (₹)"><input className="input" type="number" min={0} value={edit.customAmount} onChange={(e) => set('customAmount', e.target.value)} /></L>
      <L l="Billed"><select className="input" value={edit.customCycle} onChange={(e) => set('customCycle', e.target.value)}><option value="monthly">Every month</option><option value="quarterly">Every 3 months</option><option value="yearly">Every year</option></select></L>
      <L l="One-time setup cost (₹, optional)"><input className="input" type="number" min={0} value={edit.setupFee} onChange={(e) => set('setupFee', e.target.value)} /></L>
      <L l="Setup already paid?"><select className="input" value={edit.setupPaid ? 'yes' : 'no'} onChange={(e) => set('setupPaid', e.target.value === 'yes')}><option value="no">No: add it to the first invoice</option><option value="yes">Yes: do not bill it again</option></select></L>
      <div className="col-span-3"><L l="What this package includes (shown on the invoice)"><input className="input" maxLength={300} value={edit.customNote || ''} onChange={(e) => set('customNote', e.target.value)} /></L></div></>}
  </>);
}

/** Owner's price list: set the price of Edge Core, Edge Pro and Edge Elite. */
export function PacksCard() {
  const [packs, setPacks] = useState<any[]>([]); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [apply, setApply] = useState<Record<string, boolean>>({});
  const load = () => api('/platform/packs').then(setPacks).catch((e) => setErr(e.message)); useEffect(() => { load(); }, []);
  const edit = (key: string, k: string, v: any) => setPacks(packs.map((p) => (p.key === key ? { ...p, [k]: v } : p)));
  async function save(p: any) {
    setErr(''); setMsg('');
    try { const body: any = { name: p.name, tagline: p.tagline || '', customNote: p.customNote || '', applyToClients: !!apply[p.key] };
      if (p.key === 'core') { body.pricePerStudent = Number(p.pricePerStudent); body.minStudents = Number(p.minStudents); } else { body.setupFee = Number(p.setupFee); if (p.key === 'pro') body.yearlyPrice = Number(p.yearlyPrice); }
      const r = await api(`/platform/packs/${p.key}`, { method: 'PUT', body: JSON.stringify(body) }); setMsg(`${p.name} saved.${r.updated ? ` Also applied to ${r.updated} existing client${r.updated === 1 ? '' : 's'}.` : ''}`); load(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <div className="card p-4 mt-3">
      <div className="flex items-center justify-between flex-wrap gap-2"><b>Packs &amp; prices</b><span className="text-sm text-slate-600">Set the price of each pack. A new client gets a copy of these prices, and you can still give any client its own price.</span></div>
      <div className="grid grid-cols-3 gap-4 mt-3">{packs.map((p) => <div key={p.key} className="border border-slate-200 rounded p-3">
        <input className="input font-semibold" value={p.name} onChange={(e) => edit(p.key, 'name', e.target.value)} />
        <input className="input mt-2 text-sm" placeholder="One line description" value={p.tagline || ''} onChange={(e) => edit(p.key, 'tagline', e.target.value)} />
        {p.key === 'core' && <div className="mt-3 grid grid-cols-2 gap-2"><L l="₹ per student / month"><input className="input" type="number" min={0} value={p.pricePerStudent} onChange={(e) => edit(p.key, 'pricePerStudent', e.target.value)} /></L><L l="Minimum students billed"><input className="input" type="number" min={0} value={p.minStudents} onChange={(e) => edit(p.key, 'minStudents', e.target.value)} /></L></div>}
        {p.key === 'pro' && <div className="mt-3 grid grid-cols-2 gap-2"><L l="One-time setup cost (₹)"><input className="input" type="number" min={0} value={p.setupFee} onChange={(e) => edit(p.key, 'setupFee', e.target.value)} /></L><L l="Yearly package (₹ / year)"><input className="input" type="number" min={0} value={p.yearlyPrice} onChange={(e) => edit(p.key, 'yearlyPrice', e.target.value)} /></L></div>}
        {p.key === 'elite' && <div className="mt-3"><p className="text-sm text-slate-600 mb-2">Custom: you set the amount for each client (Clients → Edit). Here you can set the usual setup cost, if any.</p><L l="Usual setup cost (₹, optional)"><input className="input" type="number" min={0} value={p.setupFee} onChange={(e) => edit(p.key, 'setupFee', e.target.value)} /></L></div>}
        <label className="block text-xs text-slate-600 mt-3"><input type="checkbox" checked={!!apply[p.key]} onChange={(e) => setApply({ ...apply, [p.key]: e.target.checked })} /> Also change the price of clients already on this pack</label>
        <button className="btn mt-2" onClick={() => save(p)}>Save {p.name}</button></div>)}</div>
      {msg && <p className="text-moss text-sm mt-3">{msg}</p>}{err && <p className="text-brick text-sm mt-3">{err}</p>}
    </div>
  );
}
