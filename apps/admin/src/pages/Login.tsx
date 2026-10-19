import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../api';

export default function Login() {
  const [centres, setCentres] = useState<any[]>([]); const [centreId, setCentreId] = useState(''); const [q, setQ] = useState('');
  const [mobile, setMobile] = useState(''); const [channel, setChannel] = useState<'sms' | 'email'>('sms'); const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'centre' | 'mobile' | 'otp' | 'choose'>('centre'); const [choice, setChoice] = useState<{ choiceToken: string; options: any[] } | null>(null);
  const [hint, setHint] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const go = useNavigate();
  useEffect(() => { api('/auth/centres').then(setCentres).catch(() => setErr('Could not reach the server. Please wait a moment and refresh.')); }, []);
  const shown = centres.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const centreName = centreId === 'platform' ? 'Platform admin' : centres.find((c) => c.id === centreId)?.name;

  async function send() { setErr(''); setBusy(true); try { const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ mobile, centreId, channel }) }); setHint(r.devHint ? `Dev mode: OTP is ${r.devHint}` : r.via === 'email' ? `OTP sent to ${r.to}` : `OTP sent by SMS to ${r.to}`); setStep('otp'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function verify() { setErr(''); setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ mobile, otp, centreId }) }); if (r.choose) { setChoice(r); setStep('choose'); return; } session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function pick(userId: string) { setBusy(true); try { const r = await api('/auth/choose', { method: 'POST', body: JSON.stringify({ choiceToken: choice!.choiceToken, userId }) }); session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

  return (
    <div className="min-h-screen grid place-items-center bg-teal-900">
      <div className="w-full max-w-sm card p-8">
        <h1 className="text-2xl font-bold">Coaching Connect</h1>
        {step === 'centre' && <>
          <p className="text-slate-600 mt-1 mb-4">First, choose your coaching.</p>
          <input className="input mb-2" placeholder="Search coaching name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md">
            {shown.map((c) => <button key={c.id} onClick={() => { setCentreId(c.id); setStep('mobile'); }} className="w-full text-left px-3 py-2 border-b border-slate-100 hover:bg-teal-100"><div className="font-medium">{c.name}</div>{c.city && <div className="text-xs text-slate-500">{c.city}</div>}</button>)}
            {!shown.length && <div className="px-3 py-3 text-sm text-slate-500">{centres.length ? 'No coaching matches.' : 'Loading…'}</div>}
          </div>
          <button className="text-xs text-slate-500 mt-3 underline" onClick={() => { setCentreId('platform'); setStep('mobile'); }}>Platform admin login</button>
        </>}
        {step === 'mobile' && <>
          <p className="text-slate-600 mt-1 mb-4"><b>{centreName}</b> · <button className="underline" onClick={() => setStep('centre')}>change</button></p>
          <label className="block text-sm font-medium mb-1">Mobile number</label>
          <input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} autoFocus />
          <div className="flex gap-4 mt-3 text-sm"><label className="flex items-center gap-1"><input type="radio" checked={channel === 'sms'} onChange={() => setChannel('sms')} /> OTP by SMS</label><label className="flex items-center gap-1"><input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} /> OTP by email</label></div>
          <button className="btn w-full justify-center mt-4" disabled={mobile.length !== 10 || busy} onClick={send}>Send OTP</button>
        </>}
        {step === 'otp' && <>
          <p className="text-slate-600 mt-1 mb-4">{centreName} · {mobile}</p>
          <label className="block text-sm font-medium mb-1">Enter the 6-digit OTP</label>
          <input className="input tracking-widest text-lg" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
          <p className="text-xs text-slate-500 mt-2">{hint}</p>
          <button className="btn w-full justify-center mt-4" disabled={otp.length !== 6 || busy} onClick={verify}>Sign in</button>
          <button className="text-sm text-slate-600 mt-3 underline" onClick={() => setStep('mobile')}>Resend / change number</button>
        </>}
        {step === 'choose' && choice && <>
          <p className="font-medium mt-2 mb-2">This number is registered in more than one place. Choose:</p>
          {choice.options.map((o) => <button key={o.userId} disabled={busy} onClick={() => pick(o.userId)} className="w-full text-left border border-slate-200 rounded-md px-3 py-2 mb-2 hover:bg-teal-100"><div className="font-semibold">{o.centreName}</div><div className="text-xs text-slate-600">{o.name} · {o.role.toLowerCase()}</div></button>)}
        </>}
        {err && <p className="mt-4 text-sm text-brick">{err}</p>}
      </div>
    </div>
  );
}
