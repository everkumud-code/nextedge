import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { session } from '../api';

// [path, label, module key]; a staff member only sees the pages their owner ticked.
const nav: [string, string, string][] = [
  ['/', 'Today', ''], ['/inbox', 'Inbox', 'doubts'], ['/students', 'Students', 'students'], ['/batches', 'Batches', 'students'], ['/attendance', 'Attendance', 'attendance'], ['/fees', 'Fees', 'fees'], ['/study', 'Study', 'study'], ['/live', 'Live classes', 'live'], ['/tests', 'Tests', 'tests'], ['/homework', 'Homework', 'homework'], ['/timetable', 'Timetable', 'timetable'], ['/notices', 'Notices', 'notices'], ['/enquiries', 'Enquiries', 'enquiries'], ['/id-cards', 'ID cards', 'students'], ['/staff', 'Staff', 'staff'],
];

export default function Layout() {
  const user = session.user; const go = useNavigate();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-teal-900 text-white flex flex-col">
        <div className="px-5 py-5 border-b border-teal-800">
          <div className="text-lg font-bold leading-tight">Coaching Connect</div>
          <div className="text-xs text-teal-100/80 mt-1">{user?.name} · {user?.role.toLowerCase()}</div>
        </div>
        <nav className="flex-1 py-3">
          {[...nav.filter(([, , m]) => !m || !user?.modules || user.modules.includes(m) || ['ADMIN', 'SUPER_ADMIN'].includes(user.role)), ...(user?.role === 'SUPER_ADMIN' ? [['/centres', 'Centres', '']] : [])].map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `block px-5 py-2.5 text-sm ${isActive ? 'bg-teal-800 border-l-4 border-marigold-500 font-semibold' : 'border-l-4 border-transparent hover:bg-teal-800/60'}`}>{label}</NavLink>
          ))}
        </nav>
        <button onClick={() => { session.clear(); go('/login'); }} className="px-5 py-4 text-left text-sm text-teal-100/80 hover:text-white border-t border-teal-800">Log out</button>
      </aside>
      <main className="flex-1 p-8 max-w-6xl"><Outlet /></main>
    </div>
  );
}
