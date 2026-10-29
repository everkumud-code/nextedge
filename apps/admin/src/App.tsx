import { Navigate, Route, Routes } from 'react-router-dom';
import { session } from './api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Batches from './pages/Batches';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Notices from './pages/Notices';
import Study from './pages/Study';
import Timetable from './pages/Timetable';
import Clients from './pages/Clients';
import TimetableSchool from './pages/TimetableSchool';
import Alerts from './pages/Alerts';
import Access from './pages/Access';
import ClientDetail from './pages/ClientDetail';
import Tests from './pages/Tests';
import Homework from './pages/Homework';
import Live from './pages/Live';
import IdCards from './pages/IdCards';
import Staff from './pages/Staff';
import Enquiries from './pages/Enquiries';
import Inbox from './pages/Inbox';
import Wishes from './pages/Wishes';
import Platform from './pages/Platform';
import Subscription from './pages/Subscription';
import StaffAttendance from './pages/StaffAttendance';
import Counsellor from './pages/Counsellor';
import PayWall from './pages/PayWall';
import Records from './pages/Records';
import StudentProfile from './pages/StudentProfile';
import Exams from './pages/Exams';
import Certificates from './pages/Certificates';
import Payroll from './pages/Payroll';
import Biometric from './pages/Biometric';
import Insights from './pages/Insights';
import SchoolProfile from './pages/SchoolProfile';
import Apply from './pages/Apply';

function TimetableSwitch() { return session.user?.institutionType === 'school' ? <TimetableSchool /> : <Timetable />; }
function Private({ children }: { children: JSX.Element }) { return session.token ? children : <Navigate to="/login" replace />; }

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/apply/:centreId" element={<Apply />} />
      <Route path="/pay" element={<Private><PayWall /></Private>} />
      <Route path="/" element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentProfile />} />
        <Route path="exams" element={<Exams />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="payroll" element={<Payroll />} />
        <Route path="biometric" element={<Biometric />} />
        <Route path="insights" element={<Insights />} />
        <Route path="school-profile" element={<SchoolProfile />} />
        <Route path="batches" element={<Batches />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="fees" element={<Fees />} />
        <Route path="notices" element={<Notices />} />
        <Route path="study" element={<Study />} />
        <Route path="timetable" element={<TimetableSwitch />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="access" element={<Access />} />
        <Route path="clients" element={<Clients />} />
        <Route path="clients/:id" element={<ClientDetail />} />
        <Route path="centres" element={<Navigate to="/clients" replace />} />
        <Route path="tests" element={<Tests />} />
        <Route path="homework" element={<Homework />} />
        <Route path="live" element={<Live />} />
        <Route path="id-cards" element={<IdCards />} />
        <Route path="staff" element={<Staff />} />
        <Route path="enquiries" element={<Enquiries />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="wishes" element={<Wishes />} />
        <Route path="platform" element={<Platform />} />
        <Route path="subscription" element={<Subscription />} />
        <Route path="staff-attendance" element={<StaffAttendance />} />
        <Route path="counsellor" element={<Counsellor />} />
        <Route path="records/:kind" element={<Records />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
