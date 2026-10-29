import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';

const toData = (f: File) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(new Error('Could not read the file')); fr.readAsDataURL(f); });
const isImage = (f?: File | null) => !!f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name));
const csvOf = (head: string[], rows: string[][]) => [head, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

/** Import students, teachers, enquiries, books or stock from Excel, CSV, Word, PDF or a photo of a register: read -> check -> fix -> import. */
export default function Import() {
  const [meta, setMeta] = useState<{ ai: boolean; kinds: any[] } | null>(null); const [kind, setKind] = useState('students'); const [file, setFile] = useState<File | null>(null); const [batches, setBatches] = useState<any[]>([]); const [batchId, setBatchId] = useState('');
  const [data, setData] = useState<any>(null); const [rows, setRows] = useState<string[][]>([]); const [mapping, setMapping] = useState<Record<number, string>>({}); const [check, setCheck] = useState<any[] | null>(null); const [done, setDone] = useState<any>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const pick = useRef<HTMLInputElement>(null); const seq = useRef(0);
  useEffect(() => { api('/import/kinds').then(setMeta).catch((e) => setErr(e.message)); api('/batches').then(setBatches).catch(() => {}); }, []);
  const def = meta?.kinds.find((k) => k.key === kind); const fieldOf = (k: string) => def?.fields.find((f: any) => f.key === k);
  const records = useMemo(() => rows.map((r) => Object.fromEntries(Object.entries(mapping).filter(([, k]) => k).map(([i, k]) => [k, r[Number(i)] ?? '']))), [rows, mapping]);
  const missing = (def?.fields || []).filter((f: any) => f.required && !Object.values(mapping).includes(f.key) && !(kind === 'students' && f.key === 'class'));

  async function runCheck(recs = records) { const my = ++seq.current; if (!recs.length || !def) return; try { const r = await api('/import/commit', { method: 'POST', body: JSON.stringify({ kind, rows: recs, batchId: batchId || undefined, dryRun: true }) }); if (my === seq.current) setCheck(r.results); } catch (e: any) { if (my === seq.current) setErr(e.message); } }
  useEffect(() => { if (data) { const t = setTimeout(() => runCheck(), 350); return () => clearTimeout(t); } }, [rows, mapping, batchId, kind, data]);

  async function read() {
    if (!file) return; setErr(''); setBusy(true); setData(null); setCheck(null); setDone(null);
    try { const r = await api('/import/extract', { method: 'POST', body: JSON.stringify({ kind, file: { name: file.name, mime: file.type, data: await toData(file) } }) }); setData(r); setRows(r.rows); setMapping(Object.fromEntries(Object.entries(r.mapping).map(([i, k]) => [Number(i), String(k)]))); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function doImport() {
    setErr(''); setBusy(true); try { const r = await api('/import/commit', { method: 'POST', body: JSON.stringify({ kind, rows: records, batchId: batchId || undefined }) }); setDone(r); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const reset = () => { setData(null); setRows([]); setMapping({}); setCheck(null); setDone(null); setFile(null); setErr(''); if (pick.current) pick.current.value = ''; };
  const n = (s: string) => (check || []).filter((c) => c.status === s).length;
  const edit = (r: number, c: number, v: string) => setRows(rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)));
  if (!meta) return <p className="text-slate-500">{err || 'Loading…'}</p>;

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold">Import data</h1><p className="text-sm text-slate-600">Add many students, teachers, enquiries, books or stock items at once from an Excel, CSV, Word or PDF file — or a photo of a register.</p>
      {!data && !done && <div className="card p-5 mt-4">
        <h2 className="font-semibold mb-2">1. What are you importing?</h2>
        <div className="flex gap-2 flex-wrap">{meta.kinds.map((k) => <button key={k.key} className={kind === k.key ? 'btn sm' : 'btn-quiet'} onClick={() => setKind(k.key)}>{k.label}</button>)}</div>
        {kind === 'students' && <div className="mt-3"><label className="text-sm font-medium">Class for students whose class is not in the file</label><select className="input w-72" value={batchId} onChange={(e) => setBatchId(e.target.value)}><option value="">— take it from the file —</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>}
        <h2 className="font-semibold mt-5 mb-2">2. Choose the file</h2>
        <input ref={pick} type="file" className="hidden" accept=".xlsx,.csv,.tsv,.txt,.docx,.pdf,.jpg,.jpeg,.png,.webp,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="flex items-center gap-3"><button className="btn-quiet" onClick={() => pick.current?.click()}>{file ? 'Change file' : 'Choose file'}</button><span className="text-sm">{file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'Excel (.xlsx), CSV, Word (.docx), PDF, or a photo (JPG / PNG)'}</span></div>
        {isImage(file) && <p className={`text-sm mt-3 ${meta.ai ? 'text-slate-600' : 'text-brick'}`}>{meta.ai ? 'The photo is read by an AI reader and the text is sent for reading. Handwriting can be misread, so you will check every row before importing.' : 'Reading photos is not switched on for this server yet (the platform team needs to add the AI key). Please upload an Excel, CSV, Word or PDF file instead.'}</p>}
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="mt-5"><button className="btn" disabled={!file || busy} onClick={read}>{busy ? 'Reading the file…' : 'Read the file'}</button></div>
        <p className="text-xs text-slate-500 mt-3">Tip: the first row of the file should have column names such as <i>Name, Class, Roll No, Mobile</i>. Mobile numbers are needed for students (parents log in with them).</p>
      </div>}

      {data && !done && <div className="mt-4">
        <div className="flex items-center justify-between flex-wrap gap-3"><div><h2 className="font-semibold">3. Check and fix — {def?.label}</h2><p className="text-sm text-slate-600">{rows.length} row(s) read from <b>{file?.name}</b> ({data.source}). Pick what each column is, correct any cell, then import.</p></div><button className="btn-quiet" onClick={reset}>Start again</button></div>
        {data.warnings.map((w: string) => <p key={w} className="text-sm text-marigold-700 mt-1">⚠ {w}</p>)}
        {missing.length > 0 && <p className="text-sm text-brick mt-2">Not found yet: {missing.map((m: any) => m.label).join(', ')} — choose which column holds it.</p>}
        <div className="flex items-center gap-4 mt-3 text-sm flex-wrap"><span className="tag bg-moss text-white">{n('ok')} ready</span><span className="tag">{n('skipped')} already exist</span><span className="tag bg-brick text-white">{n('error')} need fixing</span>{kind === 'students' && !batchId && <span className="text-slate-500">Rows need a class: from the file, or choose one above.</span>}</div>
        <div className="card mt-3 overflow-x-auto max-h-[60vh]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white"><tr><th className="th w-10">#</th><th className="th w-48">Result</th>{data.columns.map((c: string, i: number) => <th key={i} className="th min-w-[150px]"><div className="text-xs text-slate-500 font-normal truncate">{c}</div><select className="input mt-1" value={mapping[i] || ''} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}><option value="">Ignore this column</option>{def!.fields.map((f: any) => <option key={f.key} value={f.key} disabled={Object.entries(mapping).some(([j, k]) => k === f.key && Number(j) !== i)}>{f.label}{f.required ? ' *' : ''}</option>)}</select></th>)}</tr></thead>
          <tbody>{rows.slice(0, 400).map((r, ri) => { const c = check?.find((x) => x.index === ri); return <tr key={ri} className={c?.status === 'error' ? 'bg-red-50' : c?.status === 'skipped' ? 'bg-slate-50 text-slate-400' : ''}><td className="td text-slate-400">{ri + 1}</td><td className="td text-xs">{!c ? '…' : c.status === 'ok' ? <span className="text-moss font-medium">Ready</span> : c.status === 'skipped' ? <span>Will be skipped — {c.reason}</span> : <span className="text-brick">{c.reason}</span>}</td>{data.columns.map((_: string, ci: number) => <td key={ci} className="td"><input className="w-full bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-edge-500 outline-none px-1 py-0.5" value={r[ci] ?? ''} onChange={(e) => edit(ri, ci, e.target.value)} /></td>)}</tr>; })}</tbody></table>{rows.length > 400 && <p className="p-3 text-xs text-slate-500">Showing the first 400 rows; all {rows.length} are imported.</p>}</div>
        {err && <p className="text-brick text-sm mt-3">{err}</p>}
        <div className="flex gap-3 mt-4 items-center"><button className="btn" disabled={busy || !n('ok') || missing.length > 0} onClick={doImport}>{busy ? 'Importing…' : `Import ${n('ok')} row(s)`}</button><span className="text-sm text-slate-500">Rows marked "already exist" or "need fixing" are not imported.</span></div>
      </div>}

      {done && <div className="card p-5 mt-4"><h2 className="text-lg font-semibold text-moss">Import finished</h2>
        <div className="grid grid-cols-3 gap-4 mt-3"><div className="p-4 bg-slate-50 rounded"><div className="text-2xl font-bold">{done.created}</div><div className="text-sm text-slate-600">added</div></div><div className="p-4 bg-slate-50 rounded"><div className="text-2xl font-bold">{done.skipped}</div><div className="text-sm text-slate-600">skipped (already there)</div></div><div className="p-4 bg-slate-50 rounded"><div className={`text-2xl font-bold ${done.errors ? 'text-brick' : ''}`}>{done.errors}</div><div className="text-sm text-slate-600">could not be added</div></div></div>
        {done.errors > 0 && <><ul className="text-sm mt-3 list-disc ml-5 text-brick">{done.results.filter((r: any) => r.status === 'error').slice(0, 8).map((r: any) => <li key={r.index}>Row {r.index + 1}: {r.reason}</li>)}</ul><button className="btn-quiet mt-2" onClick={() => { const bad = done.results.filter((r: any) => r.status === 'error').map((r: any) => [...(rows[r.index] || []), r.reason]); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + csvOf([...data.columns, 'Problem'], bad)], { type: 'text/csv' })); a.download = 'rows-not-imported.csv'; a.click(); }}>Download the rows that failed</button></>}
        <div className="mt-4"><button className="btn" onClick={reset}>Import another file</button></div></div>}
    </div>
  );
}
