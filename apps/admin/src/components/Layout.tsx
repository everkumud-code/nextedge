import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, session } from '../api';

const ROLE: Record<string, string> = { SUPER_ADMIN: 'Platform admin', ADMIN: 'Owner', FACULTY: 'Teacher', STAFF: 'Staff', STUDENT: 'Student', PARENT: 'Parent', EXPERT: 'Counsellor' };
const SCHOOL_ROLE: Record<string, string> = { ADMIN: 'Principal', FACULTY: 'Teacher' };
// [path, label, module key (feature flag + staff privilege)]; grouped. A user only sees pages their plan and owner allow.
type Item = [string, string, string, string?]; // 4th = school-specific label
const groups: { name: string; items: Item[] }[] = [
  { name: '', items: [['/', 'Today', ''], ['/inbox', 'Inbox', 'doubts']] },
  { name: 'People', items: [['/students', 'Students', 'students'], ['/batches', 'Batches', 'students', 'Classes & sections'], ['/records/admission', 'Admissions', 'admissions'], ['/enquiries', 'Enquiries', 'enquiries', 'Admission enquiries'], ['/staff', 'Staff & privileges', 'staff'], ['/id-cards', 'ID cards', 'students']] },
  { name: 'Academics', items: [['/attendance', 'Attendance', 'attendance'], ['/timetable', 'Timetable', 'timetable', 'Period timetable'], ['/exams', 'Exams & report cards', 'exams'], ['/tests', 'Online tests', 'tests'], ['/homework', 'Homework', 'homework'], ['/study', 'Study material', 'study'], ['/live', 'Live classes', 'live'], ['/records/lesson', 'Lesson diary & planner', 'planner']] },
  { name: 'Fees & office', items: [['/fees', 'Fees', 'fees'], ['/certificates', 'Certificates', 'certificates'], ['/records/visitor', 'Front desk', 'visitors'], ['/records/transport-route', 'Transport', 'transport'], ['/records/book', 'Library', 'library'], ['/records/item', 'Inventory', 'inventory']] },
  { name: 'Student welfare', items: [['/records/discipline', 'Discipline', 'discipline'], ['/records/health', 'Health & medical', 'health'], ['/records/achievement', 'Activities & awards', 'activities']] },
  { name: 'Communication', items: [['/notices', 'Notices', 'notices'], ['/wishes', 'Wishes', 'notices'], ['/records/event', 'Events & gallery', 'events'], ['/records/ptm-slot', 'PTM slots', 'events'], ['/records/teacher-feedback', 'Teacher feedback', 'feedback']] },
  { name: 'HR & payroll', items: [['/records/employee', 'Employees', 'hr'], ['/staff-attendance', 'Staff attendance', 'staff'], ['/records/staff-leave', 'Staff leave', 'hr'], ['/payroll', 'Payroll', 'hr'], ['/records/job-opening', 'Recruitment', 'hr'], ['/records/duty', 'Duties & services', 'duties']] },
  { name: 'Reports & settings', items: [['/insights', 'Reports & graphs', 'reports'], ['/school-profile', 'School profile', 'students'], ['/biometric', 'Biometric', 'biometric'], ['/subscription', 'Subscription & email', '']] },
];
const adminOnly = new Set(['/subscription', '/school-profile', '/payroll', '/insights']);

export default function Layout() {
  const user = session.user; const go = useNavigate(); const school = user?.institutionType === 'school'; const isSuper = user?.role === 'SUPER_ADMIN'; const viewing = isSuper ? session.viewCentre : null; const [centres, setCentres] = useState<any[]>([]);
  useEffect(() => { if (isSuper) api('/platform/centres').then(setCentres).catch(() => {}); }, []);
  useEffect(() => { if (isSuper && !viewing && !['/centres', '/platform', '/counsellor'].some((p) => location.pathname.startsWith(p))) go('/centres'); }, [location.pathname]);
  const openCentre = (id: string) => { const c = centres.find((x) => x.id === id); session.viewing(c ? { id: c.id, name: c.name, institutionType: c.institutionType } : null); location.assign(c ? '/' : '/centres'); };
  useEffect(() => { if (user?.role === 'ADMIN' && user.subscriptionStatus === 'suspended' && !location.pathname.startsWith('/subscription')) go('/pay'); }, []);
  const [bell, setBell] = useState<{ unread: number; items: any[] } | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => api('/notifications/mine').then(setBell).catch(() => {}); f(); const t = setInterval(f, 60000); return () => clearInterval(t); }, []);
  const owner = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const allowed = (it: Item) => { const [to, , m] = it; if (adminOnly.has(to) && !owner && to !== '/insights') return false; if (to === '/insights' && !owner && !(user?.modules || []).includes('reports')) return false; if (!m) return true; return (owner || !user?.modules || user.modules.includes(m)) && (user?.role === 'SUPER_ADMIN' || !user?.features || user.features.includes(m)); };
  const platform: Item[] = user?.role === 'SUPER_ADMIN' ? [['/centres', 'Centres', ''], ['/platform', 'Platform & payments', ''], ['/counsellor', 'Counsellor console', '']] : [];
  const platformOnly = isSuper && !viewing;
  const visible = user?.role === 'EXPERT' ? [{ name: '', items: [['/counsellor', 'Counsellor console', ''] as Item] }] : [...(platformOnly ? [] : groups.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length)), ...(platform.length ? [{ name: 'Platform', items: platform }] : [])];
  const roleLabel = (school && SCHOOL_ROLE[user?.role || '']) || ROLE[user?.role || ''] || user?.role;
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-teal-900 text-white flex flex-col max-h-screen sticky top-0">
        <div className="px-5 py-4 border-b border-teal-800">
          <div className="bg-white rounded-md px-2 py-1 inline-block"><img src="/nextedge-logo.png" alt="NextEdge" className="h-7" /></div>
          <div className="text-xs text-teal-100/80 mt-1">{user?.name} · {roleLabel}</div>
          {user?.centreName && <div className="text-xs text-teal-100/60">{user.centreName}{school ? ' · School' : ''}</div>}
          {isSuper && <div className="mt-3"><label className="text-[10px] uppercase tracking-wider text-teal-100/60">Open centre</label><select className="w-full mt-1 rounded bg-teal-800 text-white text-sm px-2 py-1.5 border border-teal-700" value={viewing || ''} onChange={(e) => openCentre(e.target.value)}><option value="">— none (platform view) —</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.name}{c.institutionType === 'school' ? ' (school)' : ''}</option>)}</select>{!viewing && <div className="text-[11px] text-teal-100/60 mt-1">Choose a centre to see its students, fees, exams…</div>}</div>}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto">
          {visible.map((g) => <div key={g.name || 'top'}>
            {g.name && <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-wider text-teal-100/50">{g.name}</div>}
            {g.items.map(([to, label, , schoolLabel]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `block px-5 py-2 text-sm ${isActive ? 'bg-teal-800 border-l-4 border-marigold-500 font-semibold' : 'border-l-4 border-transparent hover:bg-teal-800/60'}`}>{school && schoolLabel ? schoolLabel : label}</NavLink>
            ))}
          </div>)}
        </nav>
        <button onClick={() => { session.clear(); go('/login'); }} className="px-5 py-3 text-left text-sm text-teal-100/80 hover:text-white border-t border-teal-800">Log out</button>
      </aside>
      <main className="flex-1 p-8 max-w-7xl relative min-w-0">
        <button className="absolute right-8 top-6 btn-quiet" onClick={() => { setOpen(!open); if (!open && bell?.unread) api('/notifications/read-all', { method: 'POST' }).then(() => setBell(bell ? { ...bell, unread: 0 } : bell)); }}>🔔{bell?.unread ? <span className="ml-1 bg-brick text-white text-xs rounded-full px-1.5">{bell.unread}</span> : null}</button>
        {open && bell && <div className="absolute right-8 top-16 w-96 card p-3 shadow-lg z-10 max-h-96 overflow-y-auto"><div className="font-semibold mb-2">Notifications</div>{bell.items.length ? bell.items.slice(0, 30).map((n) => <div key={n.id} className={`py-2 border-t border-slate-100 text-sm ${!n.readAt ? 'font-semibold' : ''}`}><div>{n.title}</div><div className="text-slate-600 font-normal">{n.body}</div><div className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('en-IN')}</div></div>) : <p className="text-sm text-slate-500">Nothing yet.</p>}</div>}
        <Outlet /></main>
    </div>
  );
}
