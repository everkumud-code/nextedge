import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../api';

/** Login: type your coaching name + email → Login → OTP arrives by email. */
export default function Login() {
  const [centreName, setCentreName] = useState(''); const [email, setEmail] = useState(''); const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'login' | 'otp' | 'choose'>('login'); const [choice, setChoice] = useState<{ choiceToken: string; options: any[] } | null>(null);
  const [hint, setHint] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const go = useNavigate();
  const valid = centreName.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function send() { setErr(''); setBusy(true); try { const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ centreName: centreName.trim(), email: email.trim().toLowerCase() }) }); if (r.token) { session.set(r.token, r.user); go('/'); return; } setHint(r.devHint ? `Dev mode: OTP is ${r.devHint}` : `OTP sent to ${r.to || email}. Check spam if it does not arrive in a minute.`); setStep('otp'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function verify() { setErr(''); setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ centreName: centreName.trim(), email: email.trim().toLowerCase(), otp }) }); if (r.choose) { setChoice(r); setStep('choose'); return; } session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function pick(userId: string) { setBusy(true); try { const r = await api('/auth/choose', { method: 'POST', body: JSON.stringify({ choiceToken: choice!.choiceToken, userId }) }); session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

  return (
    <div className="min-h-screen grid place-items-center bg-teal-900">
      <div className="w-full max-w-sm card p-8">
        <img src="/nextedge-logo.png" alt="NextEdge" className="h-12 mb-2" />
        {step === 'login' && <>
          <p className="text-slate-600 mt-1 mb-4">Sign in with the email registered at your coaching.</p>
          <label className="block text-sm font-medium mb-1">Coaching name</label>
          <input className="input" placeholder="e.g. Sharma Classes" value={centreName} onChange={(e) => setCentreName(e.target.value)} autoFocus />
          <label className="block text-sm font-medium mb-1 mt-3">Email</label>
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && send()} />
          <button className="btn w-full justify-center mt-4" disabled={!valid || busy} onClick={send}>{busy ? 'Sending…' : 'Login'}</button>
          <p className="text-xs text-slate-500 mt-3">Platform admin? Type <b>Platform</b> as the coaching name.</p>
        </>}
        {step === 'otp' && <>
          <p className="text-slate-600 mt-1 mb-4">{centreName} · {email}</p>
          <label className="block text-sm font-medium mb-1">Enter the 6-digit OTP from your email</label>
          <input className="input tracking-widest text-lg" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && verify()} autoFocus />
          <p className="text-xs text-slate-500 mt-2">{hint}</p>
          <button className="btn w-full justify-center mt-4" disabled={otp.length !== 6 || busy} onClick={verify}>Verify & sign in</button>
          <button className="text-sm text-slate-600 mt-3 underline" onClick={() => { setStep('login'); setOtp(''); }}>Resend / change email</button>
        </>}
        {step === 'choose' && choice && <>
          <p className="font-medium mt-2 mb-2">This email is registered in more than one place. Choose:</p>
          {choice.options.map((o) => <button key={o.userId} disabled={busy} onClick={() => pick(o.userId)} className="w-full text-left border border-slate-200 rounded-md px-3 py-2 mb-2 hover:bg-teal-100"><div className="font-semibold">{o.centreName}</div><div className="text-xs text-slate-600">{o.name} · {o.role.toLowerCase()}</div></button>)}
        </>}
        {err && <p className="mt-4 text-sm text-brick">{err}</p>}
      </div>
    </div>
  );
}
