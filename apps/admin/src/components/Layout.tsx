import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, session } from '../api';

const ROLE: Record<string, string> = { SUPER_ADMIN: 'Platform admin', ADMIN: 'Owner', FACULTY: 'Teacher', STAFF: 'Staff', STUDENT: 'Student', PARENT: 'Parent', EXPERT: 'Counsellor' };
// [path, label, module key]; a staff member only sees the pages their owner ticked.
const nav: [string, string, string][] = [
  ['/', 'Today', ''], ['/inbox', 'Inbox', 'doubts'], ['/students', 'Students', 'students'], ['/batches', 'Batches', 'students'], ['/attendance', 'Attendance', 'attendance'], ['/fees', 'Fees', 'fees'], ['/study', 'Study', 'study'], ['/live', 'Live classes', 'live'], ['/tests', 'Tests', 'tests'], ['/homework', 'Homework', 'homework'], ['/timetable', 'Timetable', 'timetable'], ['/notices', 'Notices', 'notices'], ['/wishes', 'Wishes', 'notices'], ['/enquiries', 'Enquiries', 'enquiries'], ['/id-cards', 'ID cards', 'students'], ['/staff', 'Staff', 'staff'], ['/staff-attendance', 'Staff attendance', 'staff'],
  ['/records/transport-route', 'Transport', 'transport'], ['/records/book', 'Library', 'library'], ['/records/item', 'Inventory', 'inventory'], ['/records/visitor', 'Front desk', 'visitors'], ['/records/discipline', 'Discipline', 'discipline'], ['/records/achievement', 'Activities & awards', 'activities'], ['/records/health', 'Health', 'health'], ['/records/lesson', 'Planner & diary', 'planner'], ['/records/event', 'Events & gallery', 'events'], ['/records/duty', 'Duties & services', 'duties'], ['/subscription', 'Subscription', 'staff'],
];

export default function Layout() {
  const user = session.user; const go = useNavigate();
  useEffect(() => { if (user?.role === 'ADMIN' && user.subscriptionStatus === 'suspended' && !location.pathname.startsWith('/subscription')) go('/pay'); }, []); const [bell, setBell] = useState<{ unread: number; items: any[] } | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => api('/notifications/mine').then(setBell).catch(() => {}); f(); const t = setInterval(f, 60000); return () => clearInterval(t); }, []);
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-teal-900 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-teal-800">
          <div className="bg-white rounded-md px-2 py-1 inline-block"><img src="/nextedge-logo.png" alt="NextEdge" className="h-7" /></div>
          <div className="text-xs text-teal-100/80 mt-1">{user?.name} · {ROLE[user?.role || ''] || user?.role}</div>
        </div>
        <nav className="flex-1 py-3">
          {(user?.role === 'EXPERT' ? [['/counsellor', 'Counsellor console', '']] : [...nav.filter(([, , m]) => !m || ((!user?.modules || user.modules.includes(m) || ['ADMIN', 'SUPER_ADMIN'].includes(user.role)) && (!user?.features || user.features.includes(m) || user.role === 'SUPER_ADMIN'))), ...(user?.role === 'SUPER_ADMIN' ? [['/centres', 'Centres', ''], ['/platform', 'Platform', ''], ['/counsellor', 'Counsellor console', '']] : [])]).map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `block px-5 py-2.5 text-sm ${isActive ? 'bg-teal-800 border-l-4 border-marigold-500 font-semibold' : 'border-l-4 border-transparent hover:bg-teal-800/60'}`}>{label}</NavLink>
          ))}
        </nav>
        <button onClick={() => { session.clear(); go('/login'); }} className="px-5 py-4 text-left text-sm text-teal-100/80 hover:text-white border-t border-teal-800">Log out</button>
      </aside>
      <main className="flex-1 p-8 max-w-6xl relative">
        <button className="absolute right-8 top-6 btn-quiet" onClick={() => { setOpen(!open); if (!open && bell?.unread) api('/notifications/read-all', { method: 'POST' }).then(() => setBell(bell ? { ...bell, unread: 0 } : bell)); }}>🔔{bell?.unread ? <span className="ml-1 bg-brick text-white text-xs rounded-full px-1.5">{bell.unread}</span> : null}</button>
        {open && bell && <div className="absolute right-8 top-16 w-96 card p-3 shadow-lg z-10 max-h-96 overflow-y-auto"><div className="font-semibold mb-2">Notifications</div>{bell.items.length ? bell.items.slice(0, 30).map((n) => <div key={n.id} className={`py-2 border-t border-slate-100 text-sm ${!n.readAt ? 'font-semibold' : ''}`}><div>{n.title}</div><div className="text-slate-600 font-normal">{n.body}</div><div className="text-xs text-slate-400 font-normal">{new Date(n.createdAt).toLocaleString('en-IN')}</div></div>) : <p className="text-sm text-slate-500">Nothing yet.</p>}</div>}
        <Outlet /></main>
    </div>
  );
}
