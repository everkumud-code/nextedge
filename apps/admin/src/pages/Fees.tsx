import { useEffect, useState } from 'react';
import { api } from '../api';
const today = new Date().toISOString().slice(0, 10);
export default function Fees() {
  const [payments, setPayments] = useState<any[]>([]); const [students, setStudents] = useState<any[]>([]); const [summary, setSummary] = useState<any>(null);
  const [form, setForm] = useState({ studentId: '', amount: '', mode: 'UPI', paidOn: today, reference: '' }); const [err, setErr] = useState('');
  const load = () => { api('/fees/payments').then(setPayments); api('/fees/summary').then(setSummary); };
  useEffect(() => { load(); api('/students').then((s) => setStudents(s.filter((x: any) => x.active))); }, []);
  async function record() { setErr(''); try { await api('/fees/payments', { method: 'POST', body: JSON.stringify(form) }); setForm({ ...form, studentId: '', amount: '', reference: '' }); load(); } catch (e: any) { setErr(e.message); } }
  return (
    <div>
      <h1 className="text-2xl font-bold">Fees</h1>
      {summary && <p className="text-slate-600 mt-1">₹{summary.collectedThisMonth.toLocaleString('en-IN')} collected this month</p>}
      <div className="card p-4 mt-6 grid grid-cols-5 gap-3 items-end">
        <div className="col-span-2"><label className="text-sm font-medium">Student</label><select className="input" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}><option value="">Select</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} {s.rollNo ? `(${s.rollNo})` : ''}</option>)}</select></div>
        <div><label className="text-sm font-medium">Amount (₹)</label><input className="input" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} /></div>
        <div><label className="text-sm font-medium">Mode</label><select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{['UPI', 'CASH', 'CARD', 'NETBANKING', 'CHEQUE'].map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label className="text-sm font-medium">Date</label><input className="input" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></div>
        <div className="col-span-5 flex items-center gap-4"><button className="btn" disabled={!form.studentId || !form.amount} onClick={record}>Record payment</button>{err && <span className="text-brick text-sm">{err}</span>}</div>
      </div>
      <table className="card w-full mt-6"><thead><tr><th className="th">Receipt</th><th className="th">Student</th><th className="th">Amount</th><th className="th">Mode</th><th className="th">Date</th></tr></thead>
        <tbody>{payments.map((p) => <tr key={p.id}><td className="td font-mono text-xs">{p.receiptNo}</td><td className="td font-medium">{p.studentName}</td><td className="td">₹{Number(p.amount).toLocaleString('en-IN')}</td><td className="td">{p.mode}</td><td className="td">{p.paidOn}</td></tr>)}
        {!payments.length && <tr><td className="td text-slate-500" colSpan={5}>No payments recorded yet.</td></tr>}</tbody></table>
    </div>
  );
}
