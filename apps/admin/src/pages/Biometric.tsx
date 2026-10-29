import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../api';

/** Biometric / RFID: API key for the device software, plus a CSV import for exported punch logs. */
export default function Biometric() {
  const [info, setInfo] = useState<any>(null); const [msg, setMsg] = useState(''); const [rows, setRows] = useState<any[]>([]); const [res, setRes] = useState<any>(null); const [copied, setCopied] = useState('');
  const load = () => api('/biometric/info').then(setInfo).catch((e) => setMsg(e.message)); useEffect(() => { load(); }, []);
  async function newKey() { if (info?.key && !confirm('Create a new key? The old key stops working — update your device software.')) return; await api('/biometric/key', { method: 'POST' }); load(); }
  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v); setCopied(k); setTimeout(() => setCopied(''), 1500); };
  function onFile(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const wb = XLSX.read(r.result, { type: 'array', cellDates: true }); const raw: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }); const pick = (row: any, ...k: string[]) => { const key = Object.keys(row).find((h) => k.some((x) => h.toLowerCase().replace(/[^a-z]/g, '').includes(x))); return key ? row[key] : ''; }; setRows(raw.map((row) => { const t = pick(row, 'time', 'datetime', 'punch', 'timestamp', 'date'); return { id: String(pick(row, 'id', 'admission', 'roll', 'mobile', 'code', 'userid')).trim(), time: t instanceof Date ? t.toISOString() : String(t) }; }).filter((r) => r.id)); setRes(null); }; r.readAsArrayBuffer(f); }
  async function doImport() { const r = await api('/biometric/import', { method: 'POST', body: JSON.stringify({ punches: rows.map((x) => ({ id: x.id, time: x.time ? new Date(x.time).toISOString() : undefined })) }) }); setRes(r); setRows([]); }
  return (
    <div>
      <h1 className="text-2xl font-bold">Biometric & RFID attendance</h1><p className="text-sm text-slate-600">Fingerprint, face or RFID machines mark attendance automatically. Students are matched by <b>admission number</b> (or roll number if unique); staff by <b>mobile number</b>. Parents get “reached school” instantly.</p>
      {msg && <p className="text-brick text-sm mt-2">{msg}</p>}
      {info && <div className="grid grid-cols-2 gap-5 mt-5">
        <div className="card p-5"><h2 className="font-semibold">1. Connect your device software</h2><p className="text-sm text-slate-600 mt-1">Ask your biometric vendor (eSSL, ZKTeco, Realtime, Mantra…) to push punches to this web address with this key. Any software that can send an HTTP POST works.</p>
          <label className="text-sm font-medium mt-3 block">Endpoint</label><div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={info.endpoint} /><button className="btn-quiet" onClick={() => copy('e', info.endpoint)}>{copied === 'e' ? 'Copied' : 'Copy'}</button></div>
          <label className="text-sm font-medium mt-3 block">API key (send as header <code>x-api-key</code>)</label><div className="flex gap-2"><input className="input font-mono text-xs" readOnly value={info.key || 'Not created yet'} /><button className="btn-quiet" disabled={!info.key} onClick={() => copy('k', info.key)}>{copied === 'k' ? 'Copied' : 'Copy'}</button></div>
          <button className="btn mt-3" onClick={newKey}>{info.key ? 'Rotate key' : 'Create API key'}</button>
          <pre className="text-xs bg-paper rounded p-3 mt-4 overflow-x-auto">{`POST ${info.endpoint}\nx-api-key: <key>\n\n${JSON.stringify(info.sample, null, 2)}`}</pre></div>
        <div className="card p-5"><h2 className="font-semibold">2. Or import an exported log</h2><p className="text-sm text-slate-600 mt-1">Export the punch log from your machine as Excel/CSV with two columns: <b>ID</b> (admission no / roll no / staff mobile) and <b>Time</b>. First punch of the day = in; for staff a later punch = out.</p>
          <input type="file" accept=".xlsx,.xls,.csv" className="text-sm mt-3" onChange={onFile} />{rows.length > 0 && <div className="mt-3 text-sm"><b>{rows.length}</b> punches read (first: {rows[0].id} at {String(rows[0].time).slice(0, 19)}).<div><button className="btn mt-2" onClick={doImport}>Import {rows.length} punches</button></div></div>}
          {res && <div className="mt-3 text-sm text-moss">Students marked: <b>{res.students}</b> · Staff: <b>{res.staff}</b> · Already marked: {res.alreadyMarked}{res.unknown.length > 0 && <div className="text-brick">Unknown IDs: {res.unknown.slice(0, 20).join(', ')}</div>}</div>}</div></div>}
    </div>
  );
}
