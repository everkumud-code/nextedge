import { useEffect, useState } from 'react';
import { api } from '../api';
const today = new Date().toISOString().slice(0, 10); const t = (d?: string | null) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
export default function StaffAttendance() {
  const [loc, setLoc] = useState<any>({ lat: '', lng: '', geofenceM: 100, workStart: '09:00', lateAfterMin: 15, halfDayMin: 240 }); const [rows, setRows] = useState<any[]>([]); const [date, setDate] = useState(today); const [msg, setMsg] = useState('');
  const load = () => api(`/staff-attendance/register?date=${date}&month=${date.slice(0, 7)}`).then(setRows);
  useEffect(() => { api('/staff-attendance/location').then((l) => l && setLoc({ ...loc, ...l })); }, []); useEffect(() => { load(); }, [date]);
  async function saveLoc() { setMsg(''); try { await api('/staff-attendance/location', { method: 'PUT', body: JSON.stringify({ ...loc, lat: Number(loc.lat), lng: Number(loc.lng), geofenceM: Number(loc.geofenceM), lateAfterMin: Number(loc.lateAfterMin), halfDayMin: Number(loc.halfDayMin) }) }); setMsg('Centre location saved — staff can check in from the app now'); } catch (e: any) { setMsg(e.message); } }
  function useHere() { if (!navigator.geolocation) { setMsg('This browser has no location access'); return; } navigator.geolocation.getCurrentPosition((p) => setLoc({ ...loc, lat: p.coords.latitude.toFixed(7), lng: p.coords.longitude.toFixed(7) }), () => setMsg('Allow location access in the browser, or paste coordinates from Google Maps'), { enableHighAccuracy: true }); }
  async function manual(userId: string, status: string) { const note = prompt('Note (optional)') || undefined; await api('/staff-attendance/manual', { method: 'POST', body: JSON.stringify({ userId, date, status, note }) }); load(); }
  return (
    <div>
      <h1 className="text-2xl font-bold">Staff attendance</h1>
      <div className="card p-4 mt-6"><h2 className="font-semibold mb-1">Centre location & geofence</h2><p className="text-sm text-slate-600 mb-2">Teachers and staff can only check in when their phone is within this circle. Open Google Maps on your phone at the centre, long-press the spot → copy the coordinates, or use the button while standing at the centre.</p>
        <div className="grid grid-cols-6 gap-3 items-end">
          <div><label className="text-sm font-medium">Latitude</label><input className="input" value={loc.lat ?? ''} onChange={(e) => setLoc({ ...loc, lat: e.target.value })} placeholder="23.3441" /></div>
          <div><label className="text-sm font-medium">Longitude</label><input className="input" value={loc.lng ?? ''} onChange={(e) => setLoc({ ...loc, lng: e.target.value })} placeholder="85.3096" /></div>
          <div><label className="text-sm font-medium">Radius (m)</label><input className="input" type="number" value={loc.geofenceM} onChange={(e) => setLoc({ ...loc, geofenceM: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Work starts</label><input className="input" type="time" value={loc.workStart} onChange={(e) => setLoc({ ...loc, workStart: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Late after (min)</label><input className="input" type="number" value={loc.lateAfterMin} onChange={(e) => setLoc({ ...loc, lateAfterMin: e.target.value })} /></div>
          <div><label className="text-sm font-medium">Half-day under (min)</label><input className="input" type="number" value={loc.halfDayMin} onChange={(e) => setLoc({ ...loc, halfDayMin: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-3 mt-3"><button className="btn-quiet" onClick={useHere}>📍 Use my current location</button><button className="btn" disabled={!loc.lat || !loc.lng} onClick={saveLoc}>Save</button>{loc.lat && loc.lng && <a className="text-sm underline" href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer">view on map</a>}{msg && <span className="text-sm">{msg}</span>}</div></div>
      <div className="flex items-center gap-3 mt-6"><h2 className="font-semibold">Register</h2><input className="input w-44" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><span className="text-sm text-slate-600">{rows.filter((r) => r.today?.checkIn).length} of {rows.length} checked in</span></div>
      <table className="card w-full mt-3"><thead><tr><th className="th">Name</th><th className="th">Role</th><th className="th">In</th><th className="th">Out</th><th className="th">Hours</th><th className="th">Status</th><th className="th">This month</th><th className="th"></th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="td font-medium">{r.name}</td><td className="td">{r.roleLabel}</td><td className="td">{t(r.today?.checkIn)}{r.today?.inDistanceM != null && <span className="text-xs text-slate-400"> · {r.today.inDistanceM} m</span>}</td><td className="td">{t(r.today?.checkOut)}</td><td className="td">{r.today?.minutes ? (r.today.minutes / 60).toFixed(1) : '—'}</td>
          <td className="td">{r.today ? <span className={`tag ${r.today.status === 'present' || r.today.status === 'manual' ? 'bg-moss text-white' : r.today.status === 'late' || r.today.status === 'half-day' ? 'bg-marigold-500' : r.today.status === 'leave' ? '' : 'bg-brick text-white'}`}>{r.today.status}{r.today.note ? ' · ' + r.today.note : ''}</span> : <span className="text-slate-400">not checked in</span>}</td>
          <td className="td text-xs">{r.month.days} days · {r.month.late} late · {r.month.halfDay} half · {r.month.leave} leave · {r.month.hours} h</td>
          <td className="td"><select className="input py-1" value="" onChange={(e) => e.target.value && manual(r.id, e.target.value)}><option value="">Mark…</option><option value="manual">Present (manual)</option><option value="leave">Leave</option><option value="absent">Absent</option><option value="half-day">Half-day</option></select></td></tr>)}</tbody></table>
    </div>
  );
}
