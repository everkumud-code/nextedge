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
import Centres from './pages/Centres';
import Tests from './pages/Tests';
import Homework from './pages/Homework';
import Live from './pages/Live';
import IdCards from './pages/IdCards';

function Private({ children }: { children: JSX.Element }) { return session.token ? children : <Navigate to="/login" replace />; }

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="batches" element={<Batches />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="fees" element={<Fees />} />
        <Route path="notices" element={<Notices />} />
        <Route path="study" element={<Study />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="centres" element={<Centres />} />
        <Route path="tests" element={<Tests />} />
        <Route path="homework" element={<Homework />} />
        <Route path="live" element={<Live />} />
        <Route path="id-cards" element={<IdCards />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
