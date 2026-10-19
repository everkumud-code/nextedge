import { useEffect, useState } from 'react';
import { api, session } from '../api';

export default function Dashboard() {
  const [students, setStudents] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]);
  const [fees, setFees] = useState<{ collectedThisMonth: number; collectedTotal: number } | null>(null); const [notices, setNotices] = useState<any[]>([]);
  useEffect(() => { api('/students').then(setStudents); api('/batches').then(setBatches); api('/fees/summary').then(setFees); api('/notices').then(setNotices); }, []);
  const active = students.filter((s) => s.active).length;
  return (
    <div>
      {session.user?.subscriptionStatus && ['grace', 'suspended', 'trial'].includes(session.user.subscriptionStatus) && (
        <div className={`card p-3 mb-4 text-sm ${session.user.subscriptionStatus === 'suspended' ? 'border-brick' : 'border-marigold-500 bg-marigold-100'}`}>
          {session.user.subscriptionStatus === 'suspended' ? 'Your subscription is suspended — the centre is read-only until renewed. ' : session.user.subscriptionStatus === 'grace' ? 'Your subscription has expired — renew within the grace period to avoid suspension. ' : 'You are on a free trial. '}
          <a className="underline font-semibold" href="/subscription">Subscription</a>
        </div>
      )}
      <h1 className="text-2xl font-bold">Today</h1>
      <p className="text-slate-600 mt-1">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      <div className="grid grid-cols-3 gap-4 mt-6">
        <Stat label="Active students" value={active} note={`${batches.length} batches`} />
        <Stat label="Fees collected this month" value={fees ? `₹${fees.collectedThisMonth.toLocaleString('en-IN')}` : '—'} note={fees ? `₹${fees.collectedTotal.toLocaleString('en-IN')} all time` : ''} />
        <Stat label="Notices this week" value={notices.filter((n) => Date.now() - new Date(n.publishedAt).getTime() < 7 * 864e5).length} note={notices[0] ? `Latest: ${notices[0].title}` : 'None yet'} />
      </div>
      {students.length === 0 && <div className="card mt-8 p-6"><p className="font-semibold">No students yet.</p><p className="text-slate-600 text-sm mt-1">Add your first batch, then add students to it. Parents get their login the moment a student is added.</p></div>}
    </div>
  );
}
function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="card p-5"><div className="text-sm text-slate-600">{label}</div><div className="text-3xl font-bold mt-1">{value}</div>{note && <div className="text-xs text-slate-500 mt-1">{note}</div>}</div>;
}
