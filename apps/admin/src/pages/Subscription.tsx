import { useEffect, useState } from 'react';
import { api } from '../api';
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
export default function Subscription() {
  const [s, setS] = useState<any>(null); const [p, setP] = useState({ liveProvider: 'jitsi', zoomAccountId: '', zoomClientId: '', zoomClientSecret: '', defaultMeetingUrl: '' }); const [msg, setMsg] = useState('');
  const load = () => api('/subscription').then((r) => { setS(r); setP({ liveProvider: r.liveProvider, zoomAccountId: '', zoomClientId: '', zoomClientSecret: '', defaultMeetingUrl: r.defaultMeetingUrl || '' }); }); useEffect(() => { load(); }, []);
  if (!s) return <p>Loading…</p>;
  const end = s.status === 'trial' ? s.trialEndsAt : s.paidUntil;
  return (
    <div>
      <h1 className="text-2xl font-bold">Subscription & settings</h1>
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="card p-4"><h2 className="font-semibold mb-2">Your plan</h2>
          <div className="text-sm space-y-1"><div>Status: <b className={s.status === 'active' ? 'text-moss' : s.status === 'suspended' ? 'text-brick' : ''}>{s.status}</b>{end && <> · {s.status === 'trial' ? 'trial ends' : 'paid until'} <b>{end}</b></>}</div><div>Active students: <b>{s.activeStudents}</b> (billed minimum {s.minStudents})</div><div>Rate: <b>{inr(s.pricePerStudent)}</b> per student per month · {s.billingCycle}</div><div>Next renewal estimate: <b>{inr(s.estimateNext)}</b></div></div>
          {s.openInvoice ? <div className="mt-3 p-3 rounded bg-marigold-100 text-sm"><b>Invoice due: {inr(s.openInvoice.amount)}</b> for {s.openInvoice.periodFrom} → {s.openInvoice.periodTo}.{s.openInvoice.paymentLink ? <> <a className="underline font-semibold" href={s.openInvoice.paymentLink} target="_blank" rel="noreferrer">Pay online</a></> : ' Pay by UPI/bank transfer and share the reference with support.'}</div>
            : <button className="btn mt-3" onClick={async () => { const r = await api('/subscription/invoice', { method: 'POST' }); setMsg(`Invoice raised: ${inr(r.amount)}`); load(); }}>Renew now</button>}
          {msg && <p className="text-sm mt-2">{msg}</p>}</div>
        <div className="card p-4"><h2 className="font-semibold mb-2">Live classes run on</h2>
          <select className="input mb-2" value={p.liveProvider} onChange={(e) => setP({ ...p, liveProvider: e.target.value })}><option value="jitsi">Built-in video room (free, no setup)</option><option value="zoom">Zoom — meetings created automatically</option><option value="meet">Google Meet — your standing meeting link</option><option value="teams">Microsoft Teams — your standing meeting link</option><option value="custom">Any other link</option></select>
          {p.liveProvider === 'zoom' && <div className="space-y-2 text-sm"><p className="text-slate-600">marketplace.zoom.us → Develop → Build App → <b>Server-to-Server OAuth</b> → copy these three. Scopes: meeting:write, user:read.</p><input className="input" placeholder="Account ID" value={p.zoomAccountId} onChange={(e) => setP({ ...p, zoomAccountId: e.target.value })} /><input className="input" placeholder="Client ID" value={p.zoomClientId} onChange={(e) => setP({ ...p, zoomClientId: e.target.value })} /><input className="input" type="password" placeholder="Client Secret" value={p.zoomClientSecret} onChange={(e) => setP({ ...p, zoomClientSecret: e.target.value })} /></div>}
          {['meet', 'teams', 'custom'].includes(p.liveProvider) && <div className="text-sm"><p className="text-slate-600 mb-1">{p.liveProvider === 'meet' ? 'meet.google.com → New meeting → "Create a meeting for later" → paste the link.' : p.liveProvider === 'teams' ? 'Teams → Calendar → Meet now / schedule → copy the meeting link.' : 'Paste the link students should join.'}</p><input className="input" placeholder="https://…" value={p.defaultMeetingUrl} onChange={(e) => setP({ ...p, defaultMeetingUrl: e.target.value })} /></div>}
          <button className="btn mt-3" onClick={async () => { await api('/subscription/live-provider', { method: 'PUT', body: JSON.stringify({ ...p, zoomAccountId: p.zoomAccountId || undefined, zoomClientId: p.zoomClientId || undefined, zoomClientSecret: p.zoomClientSecret || undefined }) }); setMsg('Saved'); }}>Save</button>
          <p className="text-xs text-slate-500 mt-2">Every scheduled class gets its link from here. You can still paste a one-off link on the Live classes page.</p></div>
      </div>
    </div>
  );
}
