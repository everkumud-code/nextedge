import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemePicker from '../components/ThemePicker';
import LangSwitch from '../components/LangSwitch';
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
  const [ws, setWs] = useState<{ id: string; name: string; city?: string } | null>(null); // set when the page is opened on <client>.nextsoftwares.in
  const [hint, setHint] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const go = useNavigate();
  useEffect(() => { api('/auth/mode').then(setMode).catch(() => {}); api('/workspace/by-host').then((w) => { if (w?.found) { setWs({ id: w.id, name: w.name, city: w.city }); setCentreName(w.name); } }).catch(() => {}); }, []);
  const mobileMode = isMobile(ident); const valid = centreName.trim().length > 1 && (isEmail(ident) || mobileMode);
  const options: Channel[] = (['email', 'sms', 'whatsapp'] as Channel[]).filter((c) => (c === 'email' ? !mobileMode || true : mode?.channels?.[c]));
  const chosen: Channel = (channel || (mobileMode ? (mode?.channels?.sms ? 'sms' : mode?.channels?.whatsapp ? 'whatsapp' : 'email') : 'email')) as Channel;
  const who = () => (mobileMode ? { mobile: ident.replace(/\s/g, '') } : { email: ident.trim().toLowerCase() });

  async function send(ch: Channel = chosen) {
    setErr(''); setBusy(true);
    try {
      const r = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ ...(ws ? { centreId: ws.id } : { centreName: centreName.trim() }), ...who(), channel: mode?.otpEnabled ? ch : undefined }) });
      if (r.token) { session.set(r.token, r.user); go('/'); return; }
      setHint(r.devHint ? `Dev mode: OTP is ${r.devHint}` : `OTP sent by ${LABEL[(r.via as Channel) || ch] || r.via} to ${r.to || ident}.${r.via === 'email' ? ' Check spam if it does not arrive in a minute.' : ''}`); setStep('otp');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function verify() { setErr(''); setBusy(true); try { const r = await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ ...(ws ? { centreId: ws.id } : { centreName: centreName.trim() }), ...who(), otp }) }); if (r.choose) { setChoice(r); setStep('choose'); return; } session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function pick(userId: string) { setBusy(true); try { const r = await api('/auth/choose', { method: 'POST', body: JSON.stringify({ choiceToken: choice!.choiceToken, userId }) }); session.set(r.token, r.user); go('/'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] relative" style={{ background: 'radial-gradient(900px 420px at 8% -8%, rgba(94,234,212,.22), transparent), radial-gradient(800px 520px at 100% 112%, rgba(242,169,59,.16), transparent), #0c3a3f' }}>
      <div className="absolute right-4 top-4 text-white z-10"><LangSwitch dark /></div><div className="absolute top-3 right-3"><ThemePicker floating up={false} /></div>
      <div className="hidden lg:flex flex-col justify-center px-14 text-white">
        <div className="bg-white rounded-xl px-3 py-2 inline-block self-start mb-8"><img src="/nextedge-logo.png" alt="NextEdge" className="h-9" /></div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight max-w-lg">School and coaching management, all in one place.</h1>
        <p className="text-teal-100/80 mt-3 max-w-md">Admissions, attendance, fees, exams and report cards, notices and the parent app. Every school gets its own address.</p>
        <ul className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 max-w-lg text-sm">{['Attendance and timetable', 'Fees, receipts and payroll', 'Exams and report cards', 'Notices, homework and messaging', 'Parent and student app', 'Reports and graphs'].map((t) => <li key={t} className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-teal-200/20 grid place-items-center text-teal-200 text-xs">✓</span>{t}</li>)}</ul>
        <p className="text-xs text-teal-100/50 mt-12">A Next Resource company · nextsoftwares.in</p>
      </div>
      <div className="grid place-items-center p-6">
      <div className="w-full max-w-sm card p-8 shadow-2xl">
        <img src="/nextedge-logo.png" alt="NextEdge" className="h-12 mb-2 lg:hidden" />
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        {step === 'login' && <>
          <p className="text-slate-600 mt-1 mb-4">Sign in with the email or mobile registered at your coaching or school.</p>
          {ws ? <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2"><div className="text-xs text-slate-500">Signing in to</div><div className="font-semibold">{ws.name}{ws.city ? <span className="font-normal text-slate-500"> · {ws.city}</span> : null}</div><a className="text-xs underline text-slate-500" href={`https://www.${location.hostname.split('.').slice(1).join('.')}`}>Not your school? Go to the NextSoftwares login page</a></div>
            : <><label className="block text-sm font-medium mb-1">Coaching / school name</label>
          <input className="input" placeholder="e.g. Sharma Classes" value={centreName} onChange={(e) => setCentreName(e.target.value)} autoFocus /></>}
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
    </div>
  );
}
