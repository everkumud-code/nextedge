import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../api';

type Channel = 'email' | 'sms' | 'whatsapp';
const LABEL: Record<Channel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
const isMobile = (v: string) => /^\d{10}$/.test(v.replace(/\s/g, ''));
const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** Login: coaching / school name + email or mobile -> OTP by email, SMS or WhatsApp (whatever the school has set up). */
export default function Login() {
  const [centreName, setCentreName] = useState(''); const [ident, setIdent] = useState(''); const [otp, setOtp] = useState(''); const [channel, setChannel] = useState<Channel | ''>('');
  const [mode, setMode] = useState<{ otpEnabled: boolean; channels: Record<Channel, boolean> } | null>(null);
  const [step, setStep] = useState<'login' | 'otp' | 'choose'>('login'); const [choice, setChoice] = useState<{ choiceToken: string; options: any[] } | null>(null);
  const [hint, setHint] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const go = useNavigate();
  useEffect(() => { api('/auth/mode').then(setMode).catch(() => {}); }, []);
  const mobileMode = isMobile(ident); const valid = centreName.trim().length > 1 && (isEmail(ident) || mobileMode);
  const options: Channel[] = (['email', 'sms', 'whatsapp'] as Channel[]).filter((c) => (c === 'email' ? !mobileMode || true : mode?.channels?.[c]));
  const chosen: Channel = (channel || (mobileMode ? (mode?.channels?.sms ? 'sms' : mode?.channels?.whatsapp ? 'whatsapp' : 'email') : 'email')) as Channel;
  const who = () => (mobileMode ? { mobile: ident.replace(/\s/g, '') } : { email: ident.trim().toLowerCase() });

  async function send(ch: Channel = chosen) {
    setErr(''); setBusy(true);
    try {
      const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ centreName: centreName.trim(), ...who(), channel: mode?.otpEnabled ? ch : undefined }) });
      if (r.token) { session.set(r.token, r.user); go('/'); return; }
      setHint(r.devHint ? `Dev mode: OTP is ${r.devHint}` : `OTP sent by ${LABEL[(r.via as Channel) || ch] || r.via} to ${r.to || ident}.${r.via === 'email' ? ' Check spam if it does not arrive in a minute.' : ''}`); setStep('otp');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verify() { setErr(''); setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ centreName: centreName.trim(), ...who(), otp }) }); if (r.choose) { setChoice(r); setStep('choose'); return; } session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function pick(userId: string) { setBusy(true); try { const r = await api('/auth/choose', { method: 'POST', body: JSON.stringify({ choiceToken: choice!.choiceToken, userId }) }); session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

  return (
    <div className="min-h-screen grid place-items-center bg-teal-900">
      <div className="w-full max-w-sm card p-8">
        <img src="/nextedge-logo.png" alt="NextEdge" className="h-12 mb-2" />
        {step === 'login' && <>
          <p className="text-slate-600 mt-1 mb-4">Sign in with the email or mobile registered at your coaching or school.</p>
          <label className="block text-sm font-medium mb-1">Coaching / school name</label>
          <input className="input" placeholder="e.g. Sharma Classes" value={centreName} onChange={(e) => setCentreName(e.target.value)} autoFocus />
          <label className="block text-sm font-medium mb-1 mt-3">Email or mobile</label>
          <input className="input" placeholder="you@example.com or 10-digit mobile" value={ident} onChange={(e) => setIdent(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && valid && send()} />
          {mode?.otpEnabled && options.length > 1 && <div className="mt-3"><div className="text-sm font-medium mb-1">Send my OTP by</div><div className="flex gap-2">{options.map((c) => <button key={c} type="button" className={chosen === c ? 'btn sm' : 'btn-quiet'} onClick={() => setChannel(c)}>{LABEL[c]}</button>)}</div></div>}
          <button className="btn w-full justify-center mt-4" disabled={!valid || busy} onClick={() => send()}>{busy ? 'Sending...' : 'Login'}</button>
          <p className="text-xs text-slate-500 mt-3">Platform admin? Type <b>Platform</b> as the name.</p>
        </>}
        {step === 'otp' && <>
          <p className="text-slate-600 mt-1 mb-4">{centreName} · {ident}</p>
          <label className="block text-sm font-medium mb-1">Enter the 6-digit OTP</label>
          <input className="input tracking-widest text-lg" inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && verify()} autoFocus />
          <p className="text-xs text-slate-500 mt-2">{hint}</p>
          <button className="btn w-full justify-center mt-4" disabled={otp.length !== 6 || busy} onClick={verify}>Verify & sign in</button>
          {options.length > 1 && <div className="mt-3 text-sm text-slate-600">Did not get it? Send again by {options.map((c, i) => <span key={c}>{i > 0 && ' · '}<button className="underline" disabled={busy} onClick={() => { setOtp(''); send(c); }}>{LABEL[c]}</button></span>)}</div>}
          <button className="text-sm text-slate-600 mt-3 underline block" onClick={() => { setStep('login'); setOtp(''); }}>Change email / mobile</button>
        </>}
        {step === 'choose' && choice && <>
          <p className="font-medium mt-2 mb-2">This login is registered in more than one place. Choose:</p>
          {choice.options.map((o) => <button key={o.userId} disabled={busy} onClick={() => pick(o.userId)} className="w-full text-left border border-slate-200 rounded-md px-3 py-2 mb-2 hover:bg-teal-100"><div className="font-semibold">{o.centreName}</div><div className="text-xs text-slate-600">{o.name} · {o.role.toLowerCase()}</div></button>)}
        </>}
        {err && <p className="mt-4 text-sm text-brick">{err}</p>}
      </div>
    </div>
  );
}
