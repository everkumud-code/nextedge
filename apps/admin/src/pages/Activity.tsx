import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, session } from '../api';
import ActivityList from '../components/ActivityList';

const when = (v: any) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never');

/** Activity log. A client's owner sees their own centre. The NextEdge owner and team see the platform log and, client by client, every client's log. */
export default function Activity() {
  const isSuper = session.user?.role === 'SUPER_ADMIN'; const [sp, setSp] = useSearchParams();
  const view = sp.get('client') ? 'client' : sp.get('view') === 'clients' ? 'clients' : 'platform'; const client = sp.get('client') || '';
  const [list, setList] = useState<any[] | null>(null); const [f, setF] = useState('');
  useEffect(() => { if (isSuper && view !== 'platform') api('/activity/clients').then(setList).catch(() => setList([])); }, [view]);
  if (!isSuper) return (
    <div><h1 className="text-2xl font-bold">Activity log</h1>
      <p className="text-sm text-slate-600 mt-1">Who did what in your centre, and when: every add, edit and delete, every sign-in, and anything the NextEdge team did for you. It is kept for good; nobody can edit or erase it.</p>
      <ActivityList scope="client" /></div>
  );
  const clientName = list?.find((c) => c.id === client)?.name;
  return (
    <div>
      <h1 className="text-2xl font-bold">Activity log</h1>
      <p className="text-sm text-slate-600 mt-1">Kept for good: nobody can edit or erase it, not even from the database.</p>
      <div className="flex gap-2 mt-4">
        <button type="button" data-testid="act-tab-platform" aria-pressed={view === 'platform'} className={view === 'platform' ? 'btn sm' : 'btn-quiet'} onClick={() => setSp({})}>Platform</button>
        <button type="button" data-testid="act-tab-clients" aria-pressed={view !== 'platform'} className={view !== 'platform' ? 'btn sm' : 'btn-quiet'} onClick={() => setSp({ view: 'clients' })}>Client wise</button>
      </div>
      {view === 'platform' && <><p className="text-sm text-slate-600 mt-3">What the NextEdge owner and team did on the platform: clients, plans and billing, offers, team, Recycle bin, and their sign-ins.</p><ActivityList scope="platform" /></>}
      {view === 'clients' && (
        <div className="mt-3">
          <input className="input !w-64" placeholder="Find a client" aria-label="Find a client" value={f} onChange={(e) => setF(e.target.value)} />
          <div className="card mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="td border-t-0">Client</th><th className="td border-t-0">Last activity</th><th className="td border-t-0">Actions, 7 days</th><th className="td border-t-0">People, 7 days</th><th className="td border-t-0">Deletes, 7 days</th></tr></thead>
            <tbody>{(list || []).filter((c) => c.name.toLowerCase().includes(f.toLowerCase())).map((c) => (
              <tr key={c.id} data-testid="act-client" className="cursor-pointer hover:bg-slate-50" onClick={() => setSp({ client: c.id })}>
                <td className="td font-medium"><button type="button" className="underline text-left" onClick={() => setSp({ client: c.id })}>{c.name}</button>{c.city && <div className="text-xs text-slate-500 font-normal">{c.city}</div>}</td>
                <td className="td whitespace-nowrap">{when(c.lastAt)}</td><td className="td">{c.actions7}</td><td className="td">{c.people7}</td><td className={`td ${c.deletes7 ? 'text-brick font-semibold' : ''}`}>{c.deletes7}</td>
              </tr>))}</tbody></table>
            {list === null && <p className="p-4 text-sm text-slate-500">Loading…</p>}</div>
        </div>
      )}
      {view === 'client' && (
        <div className="mt-3">
          <button type="button" className="btn-quiet" onClick={() => setSp({ view: 'clients' })}>← All clients</button>
          <h2 className="text-lg font-semibold mt-3">{clientName || 'Client'}</h2>
          <ActivityList scope="client" centre={client} />
        </div>
      )}
    </div>
  );
}
