import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
const API = (import.meta.env.VITE_API_URL ?? '') + '/api';
const full = (u: string) => (u.startsWith('/api/') ? (import.meta.env.VITE_API_URL ?? '') + u : u);
const dt = (d?: string) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

/** The school's public website: /s/<school id>. Shows only what the school has switched on. */
export default function Site() {
  const { centreId } = useParams(); const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { fetch(`${API}/public/school/${centreId}`).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message || 'Not found'); setD(j); document.title = j.name; }).catch((e) => setErr(e.message)); }, [centreId]);
  if (err) return <div className="min-h-screen grid place-items-center p-6 text-center"><div><img src="/nextedge-logo.png" alt="" className="h-8 mx-auto mb-3" /><p className="text-slate-600">{err}</p></div></div>; if (!d) return <div className="min-h-screen grid place-items-center text-slate-500">Loading…</div>;
  const Sec = ({ t, children, id }: any) => <section id={id} className="max-w-5xl mx-auto px-5 py-8"><h2 className="text-xl font-bold text-teal-900 mb-4">{t}</h2>{children}</section>;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-teal-900 text-white"><div className="max-w-5xl mx-auto px-5 py-10"><div className="flex items-center justify-between flex-wrap gap-4"><div><h1 className="text-3xl font-bold">{d.name}</h1>{d.tagline && <p className="text-teal-100 mt-1 text-lg">{d.tagline}</p>}<p className="text-teal-200/80 text-sm mt-3">{[d.board && `${d.board} board`, d.affiliationNo && `Affiliation ${d.affiliationNo}`, d.city].filter(Boolean).join(' · ')}</p></div>
        <div className="flex gap-2"><Link className="btn bg-white text-teal-900" to={`/apply/${d.id}`}>Apply for admission</Link><Link className="btn-quiet !text-white border border-teal-300" to={`/apply/${d.id}/status`}>Track application</Link></div></div></div></header>
      <Sec t="About us">{d.about ? <p className="whitespace-pre-line leading-relaxed">{d.about}</p> : <p className="text-slate-500">Welcome to {d.name}.</p>}
        <div className="grid grid-cols-4 gap-4 mt-6">{[['Students', d.students], ['Classes', d.classes.length], d.session && ['Session', d.session], d.principal && ['Principal', d.principal]].filter(Boolean).map(([l, v]: any) => <div key={l} className="bg-white rounded-lg border p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{l}</div><div className="text-xl font-bold mt-1">{v}</div></div>)}</div></Sec>
      {d.events.length > 0 && <Sec t="Upcoming events"><div className="grid grid-cols-2 gap-3">{d.events.map((e: any, i: number) => <div key={i} className="bg-white rounded-lg border p-4"><div className="text-sm text-teal-700 font-semibold">{dt(e.date)}{e.endDate && e.endDate !== e.date ? ` – ${dt(e.endDate)}` : ''}{e.time ? ` · ${e.time}` : ''}</div><div className="font-semibold mt-1">{e.title}</div>{e.venue && <div className="text-sm text-slate-500">{e.venue}</div>}{e.description && <p className="text-sm mt-1">{e.description}</p>}</div>)}</div></Sec>}
      {d.holidays.length > 0 && <Sec t="Holidays"><div className="flex flex-wrap gap-2">{d.holidays.map((h: any, i: number) => <span key={i} className="bg-white border rounded-full px-3 py-1 text-sm"><b>{dt(h.date)}</b> {h.title}</span>)}</div></Sec>}
      {d.gallery.length > 0 && <Sec t="Gallery"><div className="grid grid-cols-4 gap-3">{d.gallery.map((g: any, i: number) => <a key={i} href={full(g.url)} target="_blank" rel="noreferrer" className="block bg-white rounded-lg border overflow-hidden hover:shadow-md">{(g.cover || /\.(jpe?g|png|webp)$/i.test(g.url) || g.url.includes('/api/files/')) ? <img src={full(g.cover || g.url)} alt={g.title} className="w-full h-32 object-cover" loading="lazy" /> : <div className="h-32 grid place-items-center bg-teal-50 text-teal-700 text-sm">Open album ↗</div>}<div className="p-2 text-sm font-medium truncate">{g.title}</div></a>)}</div></Sec>}
      {d.classes.length > 0 && <Sec t="Classes offered"><div className="flex flex-wrap gap-2">{d.classes.map((c: string) => <span key={c} className="bg-white border rounded-md px-3 py-1 text-sm">{c}</span>)}</div></Sec>}
      <Sec t="Contact" id="contact"><div className="bg-white rounded-lg border p-5 grid grid-cols-3 gap-4 text-sm"><div><div className="text-xs uppercase text-slate-500">Address</div>{d.address || d.city || '—'}</div><div><div className="text-xs uppercase text-slate-500">Phone</div>{d.phone ? <a className="underline" href={`tel:${d.phone}`}>{d.phone}</a> : '—'}</div><div><div className="text-xs uppercase text-slate-500">Website</div>{d.website ? <a className="underline" href={d.website.startsWith('http') ? d.website : `https://${d.website}`} target="_blank" rel="noreferrer">{d.website}</a> : '—'}</div></div></Sec>
      <footer className="text-center text-xs text-slate-400 py-8">Powered by NextEdge</footer>
    </div>
  );
}
