import { useEffect, useState } from 'react';
import { api } from '../api';

const PACKS: [string, string][] = [['pro', 'Edge Pro'], ['elite', 'Edge Elite']];
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const blank = () => ({ id: '', code: '', title: '', kind: 'percent', value: '', plans: [] as string[], scope: 'first', validFrom: '', validTo: '', maxUses: '', active: true });
const gen = () => 'NE' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const offText = (c: any) => (c.kind === 'percent' ? `${c.value}% off` : `${inr(c.value)} off`);
// Defined outside the screen component on purpose: a component created inside another one is rebuilt on every keystroke and the typing box loses focus.
const F = ({ l, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{l}</label>{children}</div>;

/** Offers & discounts: the owner makes coupon codes and gives them to clients (schools / coaching). Clients can also type a code on their Subscription page. */
export default function Offers() {
  const [d, setD] = useState<any>(null); const [clients, setClients] = useState<any[]>([]); const [form, setForm] = useState<any | null>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [give, setGive] = useState({ centreId: '', code: '' });
  const load = () => api('/platform/coupons').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); api('/platform/centres').then(setClients).catch(() => {}); }, []);
  if (!d) return err ? <p className="text-brick">{err}</p> : <p className="text-slate-500">Loading…</p>;
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const togglePack = (p: string) => setForm({ ...form, plans: form.plans.includes(p) ? form.plans.filter((x: string) => x !== p) : [...form.plans, p] });
  async function save() {
    setErr(''); setMsg('');
    try {
      const body = { ...form, value: Number(form.value), maxUses: form.maxUses === '' ? null : Number(form.maxUses), validFrom: form.validFrom || null, validTo: form.validTo || null };
      if (form.id) await api(`/platform/coupons/${form.id}`, { method: 'PUT', body: JSON.stringify(body) }); else await api('/platform/coupons', { method: 'POST', body: JSON.stringify(body) });
      setMsg(`Coupon ${form.code.toUpperCase()} saved`); setForm(null); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function remove(c: any) {
    if (!confirm(c.usedCount || c.attached ? `${c.code} has been used or given to a client, so it will be switched off (the history stays). Continue?` : `Delete the coupon ${c.code}?`)) return;
    try { const r = await api(`/platform/coupons/${c.id}`, { method: 'DELETE' }); setMsg(r.deactivated ? `${c.code} switched off` : `${c.code} deleted`); load(); } catch (e: any) { setErr(e.message); }
  }
  async function attach() {
    setErr(''); setMsg('');
    try { const r = await api('/platform/coupons/attach', { method: 'POST', body: JSON.stringify(give) }); setMsg(`${r.code} (${r.label}) given to the client.${r.dueInvoice ? ' This client already has an unpaid invoice: void it and raise a new one for the discount to show.' : ' It is applied when the next invoice is raised.'}`); setGive({ ...give, code: '' }); load(); api('/platform/centres').then(setClients); } catch (e: any) { setErr(e.message); }
  }
  async function detach(centreId: string) { await api('/platform/coupons/detach', { method: 'POST', body: JSON.stringify({ centreId }) }); load(); api('/platform/centres').then(setClients); }
  const live = d.coupons.filter((c: any) => c.active);
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold">Offers & discounts</h1><p className="text-slate-600 text-sm">Make coupon codes and give them to your clients (schools and coaching). The discount comes off their NextEdge invoice.</p></div>
        <button className="btn text-base px-6 py-3" onClick={() => { setErr(''); setMsg(''); setForm({ ...blank(), code: gen() }); }}>+ New coupon</button></div>
      {msg && <p className="text-sm text-moss mt-3">{msg}</p>}{err && !form && <p className="text-sm text-brick mt-3">{err}</p>}

      {form && <div className="card p-5 mt-4">
        <h2 className="font-semibold">{form.id ? `Edit ${form.code}` : 'New coupon'}</h2>
        <div className="grid grid-cols-4 gap-3 mt-3">
          <F l="Coupon code" span={2}><div className="flex gap-2"><input className="input uppercase tracking-wider" disabled={!!form.id} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} placeholder="DIWALI20" />{!form.id && <button type="button" className="btn-quiet whitespace-nowrap" onClick={() => setForm({ ...form, code: gen() })}>Make one</button>}</div></F>
          <F l="Name for you (optional)" span={2}><input className="input" value={form.title} onChange={set('title')} placeholder="Diwali offer" /></F>
          <F l="Discount type"><select className="input" value={form.kind} onChange={set('kind')}><option value="percent">Percentage (%)</option><option value="amount">Flat amount (₹)</option></select></F>
          <F l={form.kind === 'percent' ? 'Percent off' : 'Rupees off'}><input className="input" type="number" min="1" value={form.value} onChange={set('value')} /></F>
          <F l="Works on" span={2}><div className="flex gap-4 items-center h-10">{PACKS.map(([k, n]) => <label key={k} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.plans.includes(k)} onChange={() => togglePack(k)} />{n}</label>)}<span className="text-xs text-slate-500">{form.plans.length ? '' : 'none ticked = every pack'}</span></div></F>
          <F l="How many invoices" span={2}><select className="input" value={form.scope} onChange={set('scope')}><option value="first">First payment only</option><option value="every">Every invoice while valid</option></select></F>
          <F l="Valid from"><input className="input" type="date" value={form.validFrom || ''} onChange={set('validFrom')} /></F>
          <F l="Valid until"><input className="input" type="date" value={form.validTo || ''} onChange={set('validTo')} /></F>
          <F l="Maximum uses (empty = no limit)"><input className="input" type="number" min="1" value={form.maxUses} onChange={set('maxUses')} /></F>
          <F l="Status"><label className="flex items-center gap-2 h-10 text-sm"><input type="checkbox" checked={form.active} onChange={set('active')} /> Switched on</label></F>
        </div>
        {err && <p className="text-sm text-brick mt-3">{err}</p>}
        <div className="flex gap-2 mt-4"><button className="btn" disabled={!form.code || !form.value} onClick={save}>Save coupon</button><button className="btn-quiet" onClick={() => { setForm(null); setErr(''); }}>Cancel</button></div>
      </div>}

      <div className="card mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">Code</th><th className="th">Offer</th><th className="th">Works on</th><th className="th">Valid</th><th className="th">Used</th><th className="th">Given to</th><th className="th"></th></tr></thead><tbody>
        {d.coupons.map((c: any) => <tr key={c.id} className={c.active ? '' : 'opacity-60'}>
          <td className="td"><b className="tracking-wider">{c.code}</b>{c.title && <div className="text-xs text-slate-500">{c.title}</div>}{!c.active && <div className="text-xs text-brick">switched off</div>}</td>
          <td className="td">{offText(c)}<div className="text-xs text-slate-500">{c.scope === 'first' ? 'first payment' : 'every invoice'}</div></td>
          <td className="td">{c.plans.length ? c.plans.map((p: string) => PACKS.find((x) => x[0] === p)?.[1] || p).join(', ') : 'Every pack'}</td>
          <td className="td">{c.validFrom || c.validTo ? `${c.validFrom || '…'} → ${c.validTo || '…'}` : 'Always'}</td>
          <td className="td">{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
          <td className="td">{c.attached} client{c.attached === 1 ? '' : 's'}</td>
          <td className="td whitespace-nowrap"><button className="btn-quiet" onClick={() => { setErr(''); setMsg(''); setForm({ ...blank(), ...c, value: String(c.value), maxUses: c.maxUses ?? '', validFrom: c.validFrom || '', validTo: c.validTo || '' }); }}>Edit</button><button className="btn-quiet" onClick={() => remove(c)}>{c.usedCount || c.attached ? 'Switch off' : 'Delete'}</button></td></tr>)}
        {!d.coupons.length && <tr><td className="td text-slate-500" colSpan={7}>No coupon yet. Press “+ New coupon”.</td></tr>}
      </tbody></table></div>

      <div className="card p-5 mt-4">
        <h2 className="font-semibold">Give a coupon to a client</h2><p className="text-sm text-slate-600">The discount is applied automatically when this client’s next invoice is raised. Clients can also type a code themselves on their Subscription page.</p>
        <div className="flex gap-3 mt-3 flex-wrap items-end">
          <div className="min-w-[260px]"><label className="text-sm font-medium">Client</label><select className="input" value={give.centreId} onChange={(e) => setGive({ ...give, centreId: e.target.value })}><option value="">— choose a client —</option>{clients.filter((c) => c.plan !== 'demo').map((c) => <option key={c.id} value={c.id}>{c.name} ({c.institutionType === 'school' ? 'school' : 'coaching'})</option>)}</select></div>
          <div className="min-w-[200px]"><label className="text-sm font-medium">Coupon</label><select className="input" value={give.code} onChange={(e) => setGive({ ...give, code: e.target.value })}><option value="">— choose a coupon —</option>{live.map((c: any) => <option key={c.id} value={c.code}>{c.code} · {offText(c)}</option>)}</select></div>
          <button className="btn" disabled={!give.centreId || !give.code} onClick={attach}>Give coupon</button>
        </div>
        {d.attached.length > 0 && <table className="w-full text-sm mt-4"><thead><tr><th className="th">Client</th><th className="th">Pack</th><th className="th">Coupon</th><th className="th"></th></tr></thead><tbody>{d.attached.map((a: any) => <tr key={a.centreId}><td className="td">{a.name} <span className="text-xs text-slate-500">({a.type === 'school' ? 'school' : 'coaching'})</span></td><td className="td">{a.plan}</td><td className="td"><b className="tracking-wider">{a.code}</b></td><td className="td"><button className="btn-quiet" onClick={() => detach(a.centreId)}>Remove</button></td></tr>)}</tbody></table>}
      </div>

      {d.used.length > 0 && <div className="card p-5 mt-4"><h2 className="font-semibold">Used so far</h2><table className="w-full text-sm mt-2"><thead><tr><th className="th">Date</th><th className="th">Client</th><th className="th">Coupon</th><th className="th">Discount given</th></tr></thead><tbody>{d.used.map((u: any, i: number) => <tr key={i}><td className="td">{String(u.at).slice(0, 10)}</td><td className="td">{u.centre}</td><td className="td"><b>{u.code}</b></td><td className="td">{inr(u.discount)}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
