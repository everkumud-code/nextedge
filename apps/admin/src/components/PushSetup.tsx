import { useEffect, useState } from 'react';
import { api } from '../api';

/** App push notifications: the platform team pastes the Firebase service-account key once; it is checked with Google before it is saved. */
export default function PushSetup() {
  const [st, setSt] = useState<any>(null); const [json, setJson] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = () => api('/messaging/push').then(setSt).catch((e) => setErr(e.message)); useEffect(() => { load(); }, []);
  async function save() { setErr(''); setMsg(''); setBusy(true); try { const r = await api('/messaging/push', { method: 'PUT', body: JSON.stringify({ json }) }); setSt(r); setJson(''); setMsg('Saved. App notifications are switched on.'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function remove() { if (!confirm('Remove the Firebase key? App notifications will stop (WhatsApp / SMS / email still work).')) return; await api('/messaging/push', { method: 'DELETE' }); setMsg('Removed.'); load(); }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => setJson(String(r.result || '')); r.readAsText(f); }
  if (!st) return null;
  return (
    <div className="card p-4 mt-6" data-testid="push-setup">
      <div className="flex items-center justify-between"><h2 className="font-semibold">App notifications (Firebase)</h2><span className={`text-xs px-2 py-1 rounded ${st.configured ? 'bg-green-100 text-moss' : 'bg-slate-100 text-slate-500'}`}>{st.configured ? `On · ${st.source === 'env' ? 'server setting' : 'saved here'}` : 'Off'}</span></div>
      {st.configured ? <p className="text-sm mt-2 text-slate-600">Project <b>{st.projectId}</b> · {st.clientEmail}</p> : <p className="text-sm mt-2 text-slate-600">Without this, the phone app gets no pop-up notifications (parents still get WhatsApp / SMS / email if those are set up). In Firebase: <b>Project settings → Service accounts → Generate new private key</b>, then upload that file here.</p>}
      <div className="mt-3"><input type="file" accept=".json,application/json" className="text-sm" onChange={onFile} aria-label="Firebase key file" /></div>
      <textarea className="input mt-2 font-mono text-xs h-24" placeholder="…or paste the whole key file here" value={json} onChange={(e) => setJson(e.target.value)} />
      <div className="flex gap-2 mt-2"><button className="btn" disabled={busy || json.trim().length < 20} onClick={save}>{busy ? 'Checking with Google…' : st.configured ? 'Replace key' : 'Save key'}</button>{st.configured && st.source === 'platform' && <button className="btn-quiet text-brick" onClick={remove}>Remove key</button>}</div>
      {msg && <p className="text-sm text-moss mt-2">{msg}</p>}{err && <p className="text-sm text-brick mt-2">{err}</p>}
    </div>
  );
}
