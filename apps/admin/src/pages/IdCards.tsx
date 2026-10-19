import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, session } from '../api';
export default function IdCards() {
  const [rows, setRows] = useState<any[]>([]); const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState('');
  useEffect(() => { api('/batches').then(setBatches); }, []); useEffect(() => { api(`/students/id-cards${batchId ? `?batchId=${batchId}` : ''}`).then(setRows); }, [batchId]);
  const bn = (id: string) => batches.find((b) => b.id === id)?.name ?? '';
  return (
    <div>
      <div className="flex items-center justify-between print:hidden"><h1 className="text-2xl font-bold">ID cards</h1><div className="flex gap-3"><select className="input w-64" value={batchId} onChange={(e) => setBatchId(e.target.value)}><option value="">All batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="btn" onClick={() => window.print()}>Print</button></div></div>
      <p className="text-sm text-slate-600 print:hidden">Scan the QR at the gate (Attendance → Gate scan) to mark present and notify the parent.</p>
      <div className="grid grid-cols-3 gap-4 mt-4 print:grid-cols-2">{rows.map((s) => <div key={s.id} className="border border-slate-300 rounded-lg p-3 bg-white flex gap-3 items-center break-inside-avoid">
        <QRCodeSVG value={s.qr} size={84} />
        <div className="text-sm"><div className="font-bold text-teal-900">{session.user?.name ? '' : ''}{s.name}</div><div>Roll {s.rollNo || '—'} · Class {s.className || '—'}</div><div className="text-slate-600">{bn(s.batchId)}</div><div className="text-xs text-slate-500">Parent: {s.parentMobile}</div></div></div>)}</div>
    </div>
  );
}
