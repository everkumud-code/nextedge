import ThemePicker from './ThemePicker';
import Assistant from './Assistant';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import LangSwitch from './LangSwitch';
import LangPrompt from './LangPrompt';
import DemoSwitch from './DemoSwitch';
import { api, session } from '../api';

const ROLE: Record<string, string> = { SUPER_ADMIN: 'Platform admin', ADMIN: 'Owner', FACULTY: 'Teacher', STAFF: 'Staff', STUDENT: 'Student', PARENT: 'Parent', EXPERT: 'Counsellor' };
const SCHOOL_ROLE: Record<string, string> = { ADMIN: 'Principal', FACULTY: 'Teacher' };
// [path, label, module key (feature flag + staff privilege)]; grouped. A user only sees pages their plan and owner allow.
type Item = [string, string, string, string?]; // 4th = school-specific label
const groups: { name: string; items: Item[] }[] = [
  // Ordered by how often a small school or coaching uses them: the top is the daily work, the bottom is rarely-opened settings.
  { name: '', items: [['/', 'Today', ''], ['/alerts', 'Alerts', ''], ['/inbox', 'Inbox', 'doubts']] },
  { name: 'Daily work', items: [['/attendance', 'Attendance', 'attendance'], ['/fees', 'Fees', 'fees'], ['/notices', 'Notices', 'notices'], ['/homework', 'Homework', 'homework'], ['/records/visitor', 'Front desk', 'visitors']] },
  { name: 'Students & admission', items: [['/students', 'Students', 'students'], ['/batches', 'Batches', 'students', 'Classes & sections'], ['/records/admission', 'Admissions', 'admissions'], ['/enquiries', 'Enquiries', 'enquiries', 'Admission enquiries'], ['/id-cards', 'ID cards', 'students'], ['/certificates', 'Certificates', 'certificates'], ['/houses', 'Houses', 'students'], ['/import', 'Import data', 'students']] },
  { name: 'Teaching & exams', items: [['/timetable', 'Timetable', 'timetable', 'Period timetable'], ['/exams', 'Exams & report cards', 'exams'], ['/tests', 'Online tests', 'tests'], ['/study', 'Study material', 'study'], ['/live', 'Live classes', 'live'], ['/records/lesson', 'Lesson diary & planner', 'planner'], ['/records/subject', 'Subjects & syllabus', 'academics']] },
  { name: 'Student care', items: [['/records/discipline', 'Discipline', 'discipline'], ['/records/behaviour', 'Behaviour', 'discipline'], ['/records/health', 'Health & medical', 'health'], ['/records/achievement', 'Activities & awards', 'activities'], ['/records/ptm-slot', 'PTM slots', 'events'], ['/records/teacher-feedback', 'Teacher feedback', 'feedback']] },
  { name: 'School life', items: [['/records/event', 'Events & gallery', 'events'], ['/wishes', 'Wishes', 'notices'], ['/records/transport-route', 'Transport', 'transport'], ['/library', 'Library', 'library'], ['/records/item', 'Inventory', 'inventory']] },
  { name: 'Staff & payroll', items: [['/staff', 'Staff & privileges', 'staff'], ['/records/employee', 'Employees', 'hr'], ['/staff-attendance', 'Staff attendance', 'staff'], ['/records/staff-leave', 'Staff leave', 'hr'], ['/payroll', 'Payroll', 'hr'], ['/records/job-opening', 'Recruitment', 'hr'], ['/records/duty', 'Duties & services', 'duties']] },
  { name: 'Reports & settings', items: [['/insights', 'Reports & graphs', 'reports'], ['/compliance', 'Board compliance', 'reports'], ['/school-profile', 'School profile', 'students'], ['/biometric', 'Biometric', 'biometric'], ['/access', 'Access & security', ''], ['/messaging', 'Messaging', ''], ['/subscription', 'Subscription & email', '']] },
];
const adminOnly = new Set(['/subscription', '/school-profile', '/payroll', '/insights', '/access', '/messaging']);

export default function Layout() {
  const user = session.user; const go = useNavigate(); const school = user?.institutionType === 'school'; const isSuper = user?.role === 'SUPER_ADMIN'; const viewing = isSuper ? session.viewCentre : null; const [centres, setCentres] = useState<any[]>([]);
  useEffect(() => { if (isSuper) api('/platform/centres').then(setCentres).catch(() => {}); }, []);
  useEffect(() => { if (isSuper && !viewing && !['/clients', '/platform', '/offers', '/messaging', '/counsellor', '/team', '/onboard'].some((p) => location.pathname.startsWith(p))) go('/clients'); }, [location.pathname]);
  const openCentre = (id: string) => { const c = centres.find((x) => x.id === id); session.viewing(c ? { id: c.id, name: c.name, institutionType: c.institutionType } : null); location.assign(c ? '/' : '/clients'); };
  useEffect(() => { if (user?.role === 'ADMIN' && user.subscriptionStatus === 'suspended' && !location.pathname.startsWith('/subscription')) go('/pay'); }, []);
  const [bell, setBell] = useState<{ unread: number; items: any[] } | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => api('/notifications/mine').then(setBell).catch(() => {}); f(); const t = setInterval(f, 60000); return () => clearInterval(t); }, []);
  const loc = useLocation(); const [menu, setMenu] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('ne_menu') || '{}'); } catch { return {}; } });
  const toggle = (name: string, now: boolean) => { const next = { ...menu, [name]: !now }; setMenu(next); try { localStorage.setItem('ne_menu', JSON.stringify(next)); } catch { /* ignore */ } };
  const onPage = (to: string) => (to === '/' ? loc.pathname === '/' : loc.pathname === to || loc.pathname.startsWith(to + '/'));
  const owner = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const allowed = (it: Item) => { const [to, , m] = it; if (to === '/compliance') return school && owner; if (to === '/messaging' && user?.role === 'SUPER_ADMIN') return false; if (adminOnly.has(to) && !owner && to !== '/insights') return false; if (to === '/insights' && !owner && !(user?.modules || []).includes('reports')) return false; if (to === '/timetable') return user?.role !== 'PARENT' && user?.role !== 'STUDENT' && (user?.role === 'SUPER_ADMIN' || !user?.features || user.features.includes('timetable')); if (to === '/alerts') return owner || user?.role === 'STAFF'; if (!m) return true; return (owner || !user?.modules || user.modules.includes(m)) && (user?.role === 'SUPER_ADMIN' || !user?.features || user.features.includes(m)); };
  const platform: Item[] = user?.role === 'SUPER_ADMIN' ? [['/clients', 'Clients', ''], ['/platform', 'Billing & plans', ''], ['/offers', 'Offers & discounts', ''], ['/messaging', 'Messaging', ''], ['/counsellor', 'Counsellors', ''], ['/team', 'Team & demo logins', ''], ['/onboard', 'Onboard a client', '']] : [];
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
          {visible.map((g) => {
            const hasActive = g.items.some(([to]) => onPage(to)); const always = !g.name || g.name === 'Platform'; const open = always || (menu[g.name] ?? (g.name === 'Daily work' || hasActive)) || hasActive && menu[g.name] === undefined;
            return <div key={g.name || 'top'}>
              {g.name && (always ? <div className="px-5 pt-3 pb-1 text-[10px] uppercase tracking-wider text-teal-100/50">{g.name}</div>
                : <button type="button" aria-expanded={open} onClick={() => toggle(g.name, open)} className="w-full flex items-center justify-between px-5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-teal-100/70 hover:text-white"><span>{g.name}</span><span aria-hidden="true" className="text-xs">{open ? '\u25BE' : '\u25B8'}</span></button>)}
              {open && g.items.map(([to, label, , schoolLabel]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `block px-5 py-2 text-sm ${isActive ? 'bg-teal-800 border-l-4 border-marigold-500 font-semibold' : 'border-l-4 border-transparent hover:bg-teal-800/60'}`}>{school && schoolLabel ? schoolLabel : label}</NavLink>
              ))}
            </div>;
          })}
        </nav>
        <DemoSwitch /><div className="px-5 py-2 border-t border-teal-800 text-teal-100"><LangSwitch dark /></div><LangPrompt />
        <ThemePicker />
        <button onClick={() => { session.clear(); go('/login'); }} className="px-5 py-3 text-left text-sm text-teal-100/80 hover:text-white border-t border-teal-800">Log out</button>
      </aside>
      <main className="flex-1 p-8 max-w-7xl relative min-w-0">
        <button className="absolute right-8 top-6 btn-quiet" onClick={() => { setOpen(!open); if (!open && bell?.unread) api('/notifications/read-all', { method: 'POST' }).then(() => setBell(bell ? { ...bell, unread: 0 } : bell)); }}>🔔{bell?.unread ? <span className="ml-1 bg-brick text-white text-xs rounded-full px-1.5">{bell.unread}</span> : null}</button>
        {open && bell && <div className="absolute right-8 top-16 w-96 card p-3 shadow-lg z-10 max-h-96 overflow-y-auto"><div className="font-semibold mb-2">Notifications</div>{bell.items.length ? bell.items.slice(0, 30).map((n) => <div key={n.id} className={`py-2 border-t border-slate-100 text-sm ${!n.readAt ? 'font-semibold' : ''}`}><div>{n.title}</div><div className="text-slate-600 font-normal">{n.body}</div><div className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('en-IN')}</div></div>) : <p className="text-sm text-slate-500">Nothing yet.</p>}</div>}
        {isSuper && viewing && <div className="mb-4 -mt-2 p-2.5 rounded bg-marigold-100 border border-marigold-500 text-sm flex items-center gap-3"><b>Support mode</b> You are inside <b>{user?.centreName}</b>. Changes you make are logged and visible to the owner.<button className="btn-quiet ml-auto" onClick={() => { session.viewing(null); location.assign('/clients'); }}>Exit to Clients</button></div>}
        <Outlet /></main>
      <Assistant />
    </div>
  );
}
