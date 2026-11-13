import { useEffect, useMemo, useState } from 'react';
import { api, session } from '../api';

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN');
const blank = () => ({ id: '', title: '', author: '', publisher: '', category: '', isbn: '', shelf: '', copies: '1', value: '', finePerDay: '', status: 'available' });
const STATUS: Record<string, string> = { issued: 'bg-slate-200', overdue: 'bg-brick text-white', returned: 'bg-moss text-white', lost: 'bg-marigold-500' };
// Defined outside the screen component on purpose: a component created inside another one is rebuilt on every keystroke and the typing box loses focus.
const F = ({ l, children, span }: any) => <div className={span ? `col-span-${span}` : ''}><label className="text-sm font-medium">{l}</label>{children}</div>;

/** Library: books (name, author, publication, category, value), categories, issue to students, return with a late fine or a lost / damaged charge. */
export default function Library() {
  const [d, setD] = useState<any>(null); const [tab, setTab] = useState<'books' | 'issue' | 'categories' | 'rules'>('issue'); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [students, setStudents] = useState<any[]>([]); const [form, setForm] = useState<any | null>(null); const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const [iss, setIss] = useState({ bookQ: '', bookId: '', stuQ: '', studentId: '', dueDate: '' }); const [ret, setRet] = useState<any | null>(null); const [newCat, setNewCat] = useState(''); const [rules, setRules] = useState({ loanDays: '14', finePerDay: '0' });
  const owner = ['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role || '');
  const load = () => api('/library').then((r) => { setD(r); setRules({ loanDays: String(r.rules.loanDays), finePerDay: String(r.rules.finePerDay) }); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); api('/students').then((r) => setStudents(Array.isArray(r) ? r : r.items || [])).catch(() => {}); }, []);
  const books: any[] = d?.books || [];
  const shownBooks = useMemo(() => books.filter((b) => (!cat || b.category === cat) && (!q || `${b.title} ${b.author} ${b.publisher} ${b.isbn} ${b.shelf}`.toLowerCase().includes(q.toLowerCase()))), [books, q, cat]);
  const pickBooks = useMemo(() => books.filter((b) => b.status === 'available' && b.available > 0 && (!iss.bookQ || `${b.title} ${b.author} ${b.isbn}`.toLowerCase().includes(iss.bookQ.toLowerCase()))).slice(0, 50), [books, iss.bookQ]);
  const pickStudents = useMemo(() => (iss.stuQ.length < 2 ? [] : students.filter((s) => `${s.name} ${s.admissionNo || ''} ${s.rollNo || ''} ${s.parentMobile || ''}`.toLowerCase().includes(iss.stuQ.toLowerCase())).slice(0, 8)), [students, iss.stuQ]);
  if (!d) return err ? <p className="text-brick">{err}</p> : <p className="text-slate-500">Loading…</p>;
  const say = (m: string) => { setMsg(m); setErr(''); };
  const run = async (fn: () => Promise<any>, ok: (r: any) => string) => { setErr(''); setMsg(''); try { const r = await fn(); say(ok(r)); load(); return r; } catch (e: any) { setErr(e.message); } };
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const chosenBook = books.find((b) => b.id === iss.bookId); const chosenStu = students.find((s) => s.id === iss.studentId);
  const open = d.loans.filter((l: any) => ['issued', 'overdue'].includes(l.status)); const owing = d.loans.filter((l: any) => !['issued', 'overdue'].includes(l.status) && l.fine + l.charge > 0 && !l.finePaid);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold">Library</h1><p className="text-sm text-slate-600">Add books, keep them in categories, issue them to students and take them back with a fine or charge if needed.</p></div></div>
      <div className="grid grid-cols-5 gap-3 mt-4">
        {[['Titles', d.stats.titles], ['Copies', d.stats.copies], ['Issued now', d.stats.out], ['Overdue', d.stats.overdue], ['Fines to collect', inr(d.stats.unpaid)]].map(([l, v]) => <div key={l as string} className="card p-3"><div className="text-xs text-slate-600">{l}</div><div className="text-xl font-bold">{v}</div></div>)}
      </div>
      <div className="flex gap-2 mt-4 flex-wrap">{([['issue', 'Issue & return'], ['books', 'Books'], ['categories', 'Categories'], ['rules', 'Fine & rules']] as const).map(([k, l]) => <button key={k} className={`${tab === k ? 'btn' : 'btn-quiet'} !text-base !px-5 !py-2.5`} onClick={() => { setTab(k); setErr(''); setMsg(''); }}>{l}</button>)}</div>
      {msg && <p className="text-sm text-moss mt-3">{msg}</p>}{err && !form && !ret && <p className="text-sm text-brick mt-3">{err}</p>}

      {tab === 'issue' && <>
        <div className="card p-5 mt-4"><h2 className="font-semibold">Issue a book</h2>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div><label className="text-sm font-medium">Book</label><input className="input" placeholder="Search by name, author or code" value={iss.bookId ? chosenBook?.title || '' : iss.bookQ} onChange={(e) => setIss({ ...iss, bookQ: e.target.value, bookId: '' })} />
              {!iss.bookId && iss.bookQ.length >= 1 && <div className="border rounded-md mt-1 max-h-48 overflow-auto bg-white">{pickBooks.map((b) => <button key={b.id} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50" onClick={() => setIss({ ...iss, bookId: b.id, bookQ: '' })}>{b.title} <span className="text-slate-500">· {b.author || 'author —'} · {b.available} available</span></button>)}{!pickBooks.length && <div className="px-3 py-2 text-sm text-slate-500">No available book matches.</div>}</div>}</div>
            <div><label className="text-sm font-medium">Student</label><input className="input" placeholder="Type 2 letters of the name, or admission no." value={iss.studentId ? chosenStu?.name || '' : iss.stuQ} onChange={(e) => setIss({ ...iss, stuQ: e.target.value, studentId: '' })} />
              {!iss.studentId && pickStudents.length > 0 && <div className="border rounded-md mt-1 max-h-48 overflow-auto bg-white">{pickStudents.map((s) => <button key={s.id} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50" onClick={() => setIss({ ...iss, studentId: s.id, stuQ: '' })}>{s.name} <span className="text-slate-500">· {s.className || ''} {s.admissionNo ? '· ' + s.admissionNo : ''}</span></button>)}</div>}</div>
            <div><label className="text-sm font-medium">Due date (empty = {d.rules.loanDays} days from today)</label><input className="input" type="date" min={d.today} value={iss.dueDate} onChange={(e) => setIss({ ...iss, dueDate: e.target.value })} /></div>
            <div className="flex items-end"><button className="btn" disabled={!iss.bookId || !iss.studentId} onClick={async () => { const r = await run(() => api('/library/issue', { method: 'POST', body: JSON.stringify({ bookId: iss.bookId, studentId: iss.studentId, dueDate: iss.dueDate || undefined }) }), (r) => `Issued “${chosenBook?.title}” to ${chosenStu?.name}. Due on ${r.dueDate}.`); if (r) setIss({ bookQ: '', bookId: '', stuQ: '', studentId: '', dueDate: '' }); }}>Issue book</button></div>
          </div>
          {err && !ret && <p className="text-sm text-brick mt-3">{err}</p>}
        </div>

        <div className="card mt-4 overflow-x-auto"><div className="p-4 pb-0 font-semibold">Books out now ({open.length})</div><table className="w-full text-sm"><thead><tr><th className="th">Book</th><th className="th">Student</th><th className="th">Issued</th><th className="th">Due</th><th className="th">Status</th><th className="th">Fine so far</th><th className="th"></th></tr></thead><tbody>
          {open.map((l: any) => <tr key={l.id}><td className="td">{l.book}</td><td className="td">{l.student}<div className="text-xs text-slate-500">{l.className} {l.admissionNo}</div></td><td className="td">{l.issuedOn}</td><td className="td">{l.dueDate}</td><td className="td"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS[l.status] || ''}`}>{l.status}</span></td><td className="td">{l.fineNow > 0 ? <b className="text-brick">{inr(l.fineNow)} <span className="font-normal text-xs">({l.daysLate} days)</span></b> : '—'}</td><td className="td"><button className="btn-quiet" onClick={() => { setErr(''); setRet({ loan: l, mode: 'ok', damaged: '', waive: false, note: '' }); }}>Take back</button></td></tr>)}
          {!open.length && <tr><td className="td text-slate-500" colSpan={7}>No book is out.</td></tr>}</tbody></table></div>

        {owing.length > 0 && <div className="card mt-4 overflow-x-auto"><div className="p-4 pb-0 font-semibold">Fines and charges to collect</div><table className="w-full text-sm"><thead><tr><th className="th">Student</th><th className="th">Book</th><th className="th">Late fine / damage</th><th className="th">Lost-book charge</th><th className="th"></th></tr></thead><tbody>
          {owing.map((l: any) => <tr key={l.id}><td className="td">{l.student}<div className="text-xs text-slate-500">{l.className}</div></td><td className="td">{l.book}{l.status === 'lost' && <span className="text-xs text-brick"> (lost)</span>}</td><td className="td">{inr(l.fine)}</td><td className="td">{inr(l.charge)}</td><td className="td"><button className="btn-quiet" onClick={() => run(() => api(`/library/loans/${l.id}/paid`, { method: 'POST' }), () => `Collected ${inr(l.fine + l.charge)} from ${l.student}`)}>Mark collected</button></td></tr>)}</tbody></table></div>}
      </>}

      {tab === 'books' && <>
        <div className="flex gap-2 mt-4 items-center flex-wrap"><input className="input w-72" placeholder="Search name, author, publication, code" value={q} onChange={(e) => setQ(e.target.value)} /><select className="input w-56" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{d.categories.map((c: any) => <option key={c.id} value={c.name}>{c.name} ({c.books})</option>)}</select><button className="btn ml-auto" onClick={() => { setErr(''); setMsg(''); setForm(blank()); }}>+ Add book</button></div>
        {form && <div className="card p-5 mt-3"><h2 className="font-semibold">{form.id ? 'Edit book' : 'Add a book'}</h2>
          <div className="grid grid-cols-4 gap-3 mt-3">
            <F l="Book name *" span={2}><input className="input" value={form.title} onChange={set('title')} /></F><F l="Author" span={2}><input className="input" value={form.author} onChange={set('author')} /></F>
            <F l="Publication" span={2}><input className="input" value={form.publisher} onChange={set('publisher')} placeholder="Publisher name" /></F>
            <F l="Category" span={2}><input className="input" list="lib-cats" value={form.category} onChange={set('category')} placeholder="Choose or type a new one" /><datalist id="lib-cats">{d.categories.map((c: any) => <option key={c.id} value={c.name} />)}</datalist></F>
            <F l="Book code / ISBN"><input className="input" value={form.isbn} onChange={set('isbn')} /></F><F l="Shelf / rack"><input className="input" value={form.shelf} onChange={set('shelf')} /></F>
            <F l="Copies"><input className="input" type="number" min="0" value={form.copies} onChange={set('copies')} /></F><F l="Value of the book (₹)"><input className="input" type="number" min="0" value={form.value} onChange={set('value')} /></F>
            <F l={`Fine per day (₹) — empty = ${inr(d.rules.finePerDay)}`} span={2}><input className="input" type="number" min="0" value={form.finePerDay} onChange={set('finePerDay')} /></F>
            {form.id && <F l="Status" span={2}><select className="input" value={form.status} onChange={set('status')}><option value="available">Available</option><option value="lost">Lost</option><option value="withdrawn">Withdrawn</option></select></F>}
          </div>
          <p className="text-xs text-slate-500 mt-2">The value is what a student is charged if the book is lost.</p>
          {err && <p className="text-sm text-brick mt-2">{err}</p>}
          <div className="flex gap-2 mt-3"><button className="btn" disabled={!form.title.trim()} onClick={async () => { const r = await run(() => (form.id ? api(`/library/books/${form.id}`, { method: 'PUT', body: JSON.stringify(form) }) : api('/library/books', { method: 'POST', body: JSON.stringify(form) })), () => `“${form.title}” saved`); if (r) setForm(null); }}>Save book</button><button className="btn-quiet" onClick={() => { setForm(null); setErr(''); }}>Cancel</button></div></div>}
        <div className="card mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">Book</th><th className="th">Author</th><th className="th">Publication</th><th className="th">Category</th><th className="th">Shelf</th><th className="th">Copies</th><th className="th">Value</th><th className="th"></th></tr></thead><tbody>
          {shownBooks.map((b) => <tr key={b.id} className={b.status === 'available' ? '' : 'opacity-60'}><td className="td"><b>{b.title}</b>{b.isbn && <div className="text-xs text-slate-500">{b.isbn}</div>}{b.status !== 'available' && <div className="text-xs text-brick">{b.status}</div>}</td><td className="td">{b.author || '—'}</td><td className="td">{b.publisher || '—'}</td><td className="td">{b.category || '—'}</td><td className="td">{b.shelf || '—'}</td><td className="td">{b.available} / {b.copies}</td><td className="td">{b.value ? inr(b.value) : '—'}</td>
            <td className="td whitespace-nowrap"><button className="btn-quiet" onClick={() => { setErr(''); setMsg(''); setForm({ ...blank(), ...b, copies: String(b.copies), value: b.value ? String(b.value) : '', finePerDay: b.finePerDay === null ? '' : String(b.finePerDay) }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button>{owner && <button className="btn-quiet" onClick={() => { if (confirm(`Remove “${b.title}”? A book that has been issued before is only taken off the shelf.`)) run(() => api(`/library/books/${b.id}`, { method: 'DELETE' }), (r) => (r.withdrawn ? 'Taken off the shelf (it has issue history)' : 'Book removed')); }}>Remove</button>}</td></tr>)}
          {!shownBooks.length && <tr><td className="td text-slate-500" colSpan={8}>{books.length ? 'No book matches.' : 'No book yet. Press “+ Add book”.'}</td></tr>}</tbody></table></div>
      </>}

      {tab === 'categories' && <div className="card p-5 mt-4"><h2 className="font-semibold">Book categories</h2><p className="text-sm text-slate-600">For example Story, Science, History, Reference, Comics, Hindi. Add your own; they appear when you add a book.</p>
        <div className="flex gap-2 mt-3"><input className="input w-72" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><button className="btn" disabled={!newCat.trim()} onClick={async () => { const r = await run(() => api('/library/categories', { method: 'POST', body: JSON.stringify({ name: newCat }) }), () => `Category “${newCat}” added`); if (r) setNewCat(''); }}>Add category</button></div>
        <table className="w-full text-sm mt-3"><thead><tr><th className="th">Category</th><th className="th">Books</th><th className="th"></th></tr></thead><tbody>{d.categories.map((c: any) => <tr key={c.id}><td className="td">{c.name}</td><td className="td">{c.books}</td><td className="td"><button className="btn-quiet" onClick={() => { const n = prompt('New name for this category', c.name); if (n && n.trim() && n !== c.name) run(() => api(`/library/categories/${c.id}`, { method: 'PUT', body: JSON.stringify({ name: n }) }), () => 'Renamed (books moved too)'); }}>Rename</button><button className="btn-quiet" onClick={() => { if (confirm(`Delete the category “${c.name}”? Books keep their category name.`)) run(() => api(`/library/categories/${c.id}`, { method: 'DELETE' }), () => 'Category deleted'); }}>Delete</button></td></tr>)}{!d.categories.length && <tr><td className="td text-slate-500" colSpan={3}>No category yet.</td></tr>}</tbody></table></div>}

      {tab === 'rules' && <div className="card p-5 mt-4 max-w-xl"><h2 className="font-semibold">Fine & rules</h2>
        <div className="grid grid-cols-2 gap-3 mt-3"><F l="A book may stay out (days)"><input className="input" type="number" min="1" disabled={!owner} value={rules.loanDays} onChange={(e) => setRules({ ...rules, loanDays: e.target.value })} /></F><F l="Late fine per day (₹), 0 = no fine"><input className="input" type="number" min="0" disabled={!owner} value={rules.finePerDay} onChange={(e) => setRules({ ...rules, finePerDay: e.target.value })} /></F></div>
        <p className="text-xs text-slate-500 mt-2">A single book can have its own fine per day in the Books tab. A lost book is charged its value. Damage can be charged when you take the book back.</p>
        {owner ? <button className="btn mt-3" onClick={() => run(() => api('/library/rules', { method: 'PUT', body: JSON.stringify({ loanDays: Number(rules.loanDays), finePerDay: Number(rules.finePerDay) }) }), () => 'Rules saved')}>Save rules</button> : <p className="text-sm text-slate-500 mt-3">Only the owner can change these.</p>}</div>}

      {ret && <div className="fixed inset-0 bg-black/40 grid place-items-center z-50" onClick={() => setRet(null)}><div className="card p-5 w-full max-w-md bg-white" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-semibold">Take back “{ret.loan.book}”</h2><p className="text-sm text-slate-600">{ret.loan.student} · due {ret.loan.dueDate}{ret.loan.daysLate > 0 ? ` · ${ret.loan.daysLate} days late` : ''}</p>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={ret.mode === 'ok'} onChange={() => setRet({ ...ret, mode: 'ok' })} /> Returned (good condition)</label>
          <label className="flex items-center gap-2"><input type="radio" checked={ret.mode === 'damaged'} onChange={() => setRet({ ...ret, mode: 'damaged' })} /> Returned damaged — charge</label>
          {ret.mode === 'damaged' && <input className="input" type="number" min="0" placeholder="Damage charge (₹)" value={ret.damaged} onChange={(e) => setRet({ ...ret, damaged: e.target.value })} />}
          <label className="flex items-center gap-2"><input type="radio" checked={ret.mode === 'lost'} onChange={() => setRet({ ...ret, mode: 'lost' })} /> Lost — charge the value of the book</label>
          {ret.loan.fineNow > 0 && <label className="flex items-center gap-2"><input type="checkbox" checked={ret.waive} onChange={(e) => setRet({ ...ret, waive: e.target.checked })} /> Waive the late fine ({inr(ret.loan.fineNow)})</label>}
          <input className="input" placeholder="Note (optional)" value={ret.note} onChange={(e) => setRet({ ...ret, note: e.target.value })} />
        </div>
        {err && <p className="text-sm text-brick mt-2">{err}</p>}
        <div className="flex gap-2 mt-4"><button className="btn" onClick={async () => { const r = await run(() => api(`/library/return/${ret.loan.id}`, { method: 'POST', body: JSON.stringify({ lost: ret.mode === 'lost', damagedCharge: ret.mode === 'damaged' ? Number(ret.damaged || 0) : 0, waive: ret.waive, note: ret.note }) }), (r) => (r.total > 0 ? `Done. Collect ${inr(r.total)} from the student${r.lostCharge ? ` (lost book ${inr(r.lostCharge)})` : ''}.` : 'Book is back. No fine.')); if (r) setRet(null); }}>Confirm</button><button className="btn-quiet" onClick={() => setRet(null)}>Cancel</button></div>
      </div></div>}
    </div>
  );
}
