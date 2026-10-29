import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
const ROLE: Record<string, string> = { ADMIN: 'Owner / Principal', FACULTY: 'Teacher', STAFF: 'Staff', PARENT: 'Parent', STUDENT: 'Student', SUPER_ADMIN: 'Platform' };
const when = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never');
const device = (ua?: string) => { if (!ua) return '—'; const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : ''; const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /Dart|okhttp/i.test(ua) ? 'App' : ''; return [br, os].filter(Boolean).join(' on ') || ua.slice(0, 30); };

/** Access management: every login account with its last login, plus the login history (successful and failed attempts). */
export default function Access() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(''); const [only, setOnly] = useState<'all' | 'failed'>('all');
  useEffect(() => { api('/access/overview').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-brick">{err}</p>; if (!d) return <p className="text-slate-500">Loading…</p>;
  const logs = d.logins.filter((l: any) => only === 'all' || !l.ok);
  return (
    <div>
      <h1 className="text-2xl font-bold">Access & security</h1><p className="text-sm text-slate-600">Who can log in, who did, and from where. Change what each staff member may open from <Link className="underline" to="/staff">Staff & access</Link>.</p>
      <div className="grid grid-cols-4 gap-4 mt-4">{[['Logins in 24 hours', d.logins24h], ['Failed attempts (24h)', d.failed24h], ['Staff & owner accounts', d.accounts.length], ['Never logged in', d.accounts.filter((a: any) => !a.lastLogin).length]].map(([l, v]) => <div key={l as string} className="card p-4"><div className="text-sm text-slate-600">{l}</div><div className={`text-2xl font-bold mt-1 ${l === 'Failed attempts (24h)' && Number(v) > 5 ? 'text-brick' : ''}`}>{v}</div></div>)}</div>
      <h2 className="font-semibold mt-6 mb-2">Accounts</h2>
      <table className="card w-full text-sm"><thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">Login (email / mobile)</th><th className="th">Access</th><th className="th">Last login</th></tr></thead>
        <tbody>{d.accounts.map((a: any) => <tr key={a.id} className={a.active ? '' : 'opacity-60'}><td className="td font-medium">{a.name}{a.title && <div className="text-xs text-slate-500 font-normal">{a.title}</div>}</td><td className="td"><span className="tag">{ROLE[a.role] || a.role}</span></td><td className="td text-xs">{a.email || <span className="text-brick">no email</span>}<div className="text-slate-500">{a.mobile}</div></td><td className="td text-xs">{!a.active ? <span className="text-brick">Deactivated</span> : a.role === 'ADMIN' ? 'Everything' : a.modules === null ? 'Default for role' : `${a.modules} modules`}</td><td className="td text-xs">{when(a.lastLogin)}</td></tr>)}</tbody></table>
      <div className="flex items-center justify-between mt-6 mb-2"><h2 className="font-semibold">Login history</h2><div className="flex gap-2"><button className={only === 'all' ? 'btn sm' : 'btn-quiet'} onClick={() => setOnly('all')}>All</button><button className={only === 'failed' ? 'btn sm' : 'btn-quiet'} onClick={() => setOnly('failed')}>Failed only</button></div></div>
      <table className="card w-full text-sm"><tbody>{logs.map((l: any) => <tr key={l.id}><td className="td whitespace-nowrap text-slate-500">{when(l.at)}</td><td className="td">{l.name || '—'}{l.role && <span className="text-xs text-slate-500"> · {ROLE[l.role] || l.role}</span>}</td><td className="td"><span className={`tag ${l.ok ? 'bg-moss text-white' : 'bg-brick text-white'}`}>{l.ok ? 'Logged in' : 'Failed'}</span>{l.note && <span className="text-xs text-slate-500 ml-2">{l.note}</span>}</td><td className="td text-xs">{device(l.device)}</td><td className="td text-xs text-slate-500 font-mono">{l.ip}</td></tr>)}{!logs.length && <tr><td className="td text-slate-500">Nothing to show.</td></tr>}</tbody></table>
    </div>
  );
}
