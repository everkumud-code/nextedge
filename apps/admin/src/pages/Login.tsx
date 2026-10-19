import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../api';

export default function Login() {
  const [mobile, setMobile] = useState(''); const [otp, setOtp] = useState(''); const [step, setStep] = useState<'mobile' | 'otp' | 'choose'>('mobile'); const [choice, setChoice] = useState<{ choiceToken: string; options: any[] } | null>(null);
  const [hint, setHint] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const go = useNavigate();

  async function send() { setErr(''); setBusy(true); try { const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ mobile }) }); setHint(r.devHint ? `Dev mode: OTP is ${r.devHint}` : 'OTP sent by SMS'); setStep('otp'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function verify() { setErr(''); setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ mobile, otp }) }); if (r.choose) { setChoice(r); setStep('choose'); return; } session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

  async function pick(userId: string) { setBusy(true); try { const r = await api('/auth/choose', { method: 'POST', body: JSON.stringify({ choiceToken: choice!.choiceToken, userId }) }); session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  return (
    <div className="min-h-screen grid place-items-center bg-teal-900">
      <div className="w-full max-w-sm card p-8">
        <h1 className="text-2xl font-bold">Coaching Connect</h1>
        <p className="text-slate-600 mt-1 mb-6">Sign in with the mobile number registered at your centre.</p>
        {step === 'choose' && choice ? (
          <>
            <p className="font-medium mb-2">This number is registered in more than one place. Choose:</p>
            {choice.options.map((o) => <button key={o.userId} disabled={busy} onClick={() => pick(o.userId)} className="w-full text-left border border-slate-200 rounded-md px-3 py-2 mb-2 hover:bg-teal-100"><div className="font-semibold">{o.centreName}</div><div className="text-xs text-slate-600">{o.name} · {o.role.toLowerCase()}</div></button>)}
          </>
        ) : step === 'mobile' ? (
          <>
            <label className="block text-sm font-medium mb-1">Mobile number</label>
            <input className="input" inputMode="numeric" maxLength={10} placeholder="10-digit number" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} />
            <button className="btn w-full justify-center mt-4" disabled={mobile.length !== 10 || busy} onClick={send}>Send OTP</button>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium mb-1">Enter the 6-digit OTP</label>
            <input className="input tracking-widest text-lg" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
            <p className="text-xs text-slate-500 mt-2">{hint}</p>
            <button className="btn w-full justify-center mt-4" disabled={otp.length !== 6 || busy} onClick={verify}>Sign in</button>
            <button className="text-sm text-slate-600 mt-3 underline" onClick={() => setStep('mobile')}>Change number</button>
          </>
        )}
        {err && <p className="mt-4 text-sm text-brick">{err}</p>}
      </div>
    </div>
  );
}
