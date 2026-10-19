import { useEffect, useState } from 'react';
import { api } from '../api';
export default function Wishes() {
  const [tpl, setTpl] = useState<any[]>([]); const [bdays, setBdays] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [bt, setBt] = useState('');
  const [f, setF] = useState({ kind: 'diwali', title: '', body: '', batchId: '', imageUrl: '' }); const [msg, setMsg] = useState('');
  useEffect(() => { api('/wishes/templates').then(setTpl); api('/wishes/birthdays').then(setBdays); api('/batches').then(setBatches); api('/wishes/birthday-template').then((r) => setBt(r.template)); }, []);
  const cur = tpl.find((t) => t.kind === f.kind);
  async function send() { setMsg('Sending…'); const r = await api('/wishes/greet', { method: 'POST', body: JSON.stringify({ ...f, title: f.title || undefined, body: f.body || undefined, batchId: f.batchId || undefined, imageUrl: f.imageUrl || undefined }) }); setMsg(r.error || `Sent to ${r.sent} people — also pinned on their notice board for 3 days`); }
  return (
    <div>
      <h1 className="text-2xl font-bold">Wishes & greetings</h1>
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="card p-4"><h2 className="font-semibold mb-2">Send a greeting</h2>
          <label className="text-sm font-medium">Occasion</label><select className="input mb-2" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, title: '', body: '' })}>{tpl.map((t) => <option key={t.kind} value={t.kind}>{t.kind === 'custom' ? 'Custom message' : t.title}</option>)}</select>
          <label className="text-sm font-medium">Title</label><input className="input mb-2" placeholder={cur?.title} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <label className="text-sm font-medium">Message</label><textarea className="input mb-2" rows={3} placeholder={cur?.body?.replace('{centre}', 'your centre name')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <div className="grid grid-cols-2 gap-2"><div><label className="text-sm font-medium">Send to</label><select className="input" value={f.batchId} onChange={(e) => setF({ ...f, batchId: e.target.value })}><option value="">Whole centre</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div><label className="text-sm font-medium">Image link (optional)</label><input className="input" placeholder="https://… (poster)" value={f.imageUrl} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} /></div></div>
          <button className="btn mt-3" onClick={send}>Send greeting</button>{msg && <p className="text-sm mt-2">{msg}</p>}</div>
        <div>
          <div className="card p-4"><h2 className="font-semibold mb-2">Birthdays this week</h2>{bdays.length ? bdays.map((b) => <div key={b.id} className={`flex justify-between py-1 text-sm ${b.today ? 'font-bold text-moss' : ''}`}><span>{b.name}{b.today ? ' 🎂 today' : ''}</span><span>{b.dob?.slice(8, 10)}/{b.dob?.slice(5, 7)}</span></div>) : <p className="text-sm text-slate-500">None this week. Add date of birth on the student form to enable auto-wishes.</p>}</div>
          <div className="card p-4 mt-4"><h2 className="font-semibold mb-2">Auto birthday wish (7 am)</h2><textarea className="input" rows={3} value={bt} onChange={(e) => setBt(e.target.value)} /><p className="text-xs text-slate-500 mt-1">{'{name}'} = first name, {'{centre}'} = centre name. Sent to the student and parent; you get a reminder too.</p><button className="btn mt-2" onClick={async () => { await api('/wishes/birthday-template', { method: 'PUT', body: JSON.stringify({ template: bt }) }); setMsg('Birthday message saved'); }}>Save</button></div>
        </div>
      </div>
    </div>
  );
}
