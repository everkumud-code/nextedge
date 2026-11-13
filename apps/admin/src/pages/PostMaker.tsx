import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, session, uploadFile } from '../api';
import { OCCASIONS, FORMATS, caption, fill, hashtags, type Lang } from '../lib/postText';
import { THEMES, drawPost, type Theme } from '../lib/postDesign';

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const LANGS: [Lang, string][] = [['en', 'English'], ['hi', 'हिन्दी'], ['hn', 'Hinglish']];
// Defined outside the screen component on purpose: a component created inside another one is rebuilt on every keystroke and the typing box loses focus.
const F = ({ l, children }: any) => <div><label className="text-sm font-medium">{l}</label>{children}</div>;

/** Social-media post maker: pick the occasion, edit the wish, and get a ready picture with the school's logo, name and contact details, plus a caption with hashtags. Drawn in the browser, nothing is sent anywhere. */
export default function PostMaker() {
  const canvas = useRef<HTMLCanvasElement>(null); const photoInput = useRef<HTMLInputElement>(null); const logoInput = useRef<HTMLInputElement>(null);
  const [brand, setBrand] = useState<any>(null); const [occ, setOcc] = useState('diwali'); const [lang, setLang] = useState<Lang>(() => { try { const v = localStorage.getItem('ne_lang'); return v === 'hi' || v === 'hn' ? v : 'en'; } catch { return 'en'; } });
  const o = OCCASIONS.find((x) => x.key === occ)!; const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [theme, setTheme] = useState<Theme>('gradient'); const [fmt, setFmt] = useState('square');
  const [colours, setColours] = useState<[string, string, string]>(o.colours); const [use, setUse] = useState({ logo: true, phone: true, website: true, address: true, signer: true, tagline: true }); const [signer, setSigner] = useState('');
  const [logo, setLogo] = useState<HTMLImageElement | null>(null); const [photo, setPhoto] = useState<HTMLImageElement | null>(null); const [msg, setMsg] = useState(''); const [cap, setCap] = useState(''); const [capEdited, setCapEdited] = useState(false);
  const owner = ['ADMIN', 'SUPER_ADMIN'].includes(session.user?.role || '');
  const loadBrand = () => api('/wishes/brand').then((b) => { setBrand(b); if (!signer) setSigner(b.principal ? `${b.principal} & Staff` : `${b.name} Family`); return b; });
  useEffect(() => { loadBrand().then((b) => { if (b?.logoId) loadImg(`/api/files/${b.logoId}`).then(setLogo); }); }, []);
  // changing the occasion or the language loads that occasion's wording (the owner can then edit it)
  useEffect(() => { const x = OCCASIONS.find((q) => q.key === occ)!; setTitle(x.title[lang]); setBody(fill(x.body[lang], brand?.name || '')); setColours(x.colours); setCapEdited(false); }, [occ, lang, brand?.name]);
  const f = FORMATS.find((x) => x.key === fmt)!;
  const opts = useMemo(() => ({ w: f.w, h: f.h, theme, colours, title, body, emoji: o.emoji, centre: brand?.name || 'Your school', tagline: use.tagline ? brand?.tagline || '' : '', phone: use.phone ? brand?.phone || '' : '', website: use.website ? brand?.website || '' : '', address: use.address ? brand?.address || '' : '', signer: use.signer ? signer : '', showLogo: use.logo, logo, photo }), [f, theme, colours, title, body, o, brand, use, signer, logo, photo]);
  useEffect(() => { if (canvas.current && brand) { const id = requestAnimationFrame(() => drawPost(canvas.current!, opts)); return () => cancelAnimationFrame(id); } }, [opts, brand]);
  useEffect(() => { if (!brand || capEdited) return; setCap(caption({ title, body, centre: brand.name, phone: use.phone ? brand.phone : '', website: use.website ? brand.website : '', address: use.address ? brand.address : '', city: brand.city, occasion: o })); }, [brand, title, body, use, o, capEdited]);
  const fname = `${o.key}-${String(brand?.name || 'post').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${f.key}.png`;
  const blob = () => new Promise<Blob | null>((res) => canvas.current!.toBlob(res, 'image/png'));
  async function download() { const b = await blob(); if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fname; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); setMsg('Picture saved. Open Facebook / Instagram / WhatsApp and add it to your post.'); }
  async function share() { const b = await blob(); if (!b) return; const file = new File([b], fname, { type: 'image/png' }); const nav: any = navigator; try { if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], text: cap }); else await download(); } catch { /* cancelled */ } }
  async function copy() { try { await navigator.clipboard.writeText(cap); setMsg('Caption copied. Paste it under your picture.'); } catch { setMsg('Could not copy; select the text and copy it.'); } }
  async function pickLogo(file?: File | null) { if (!file) return; setMsg('Uploading logo…'); try { await uploadFile(file, 'logo', session.user?.centreId || undefined); const b = await loadBrand(); if (b?.logoId) setLogo(await loadImg(`/api/files/${b.logoId}?v=${Date.now()}`)); setMsg('Logo saved. It will be used on every post.'); } catch (e: any) { setMsg(e.message); } }
  async function pickPhoto(file?: File | null) { if (!file) return; const url = URL.createObjectURL(file); setPhoto(await loadImg(url)); }
  if (!brand) return <p className="text-slate-500">Loading…</p>;
  const missing = [!brand.logoId && 'logo', !brand.phone && 'phone', !brand.address && 'address'].filter(Boolean) as string[];

  return (
    <div>
      <h1 className="text-2xl font-bold">Social media post</h1>
      <p className="text-sm text-slate-600">Choose the occasion, check the wish, and download a ready picture with your logo, name and contact details. Nothing is posted for you: you add the picture to Facebook, Instagram or WhatsApp yourself.</p>
      {missing.length > 0 && <p className="text-sm mt-2 p-2 rounded bg-marigold-100">Add your {missing.join(', ')} in <Link className="underline font-medium" to="/school-profile">School profile</Link> so they appear on the picture.</p>}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 mt-4">
        <div className="xl:col-span-2 space-y-4">
          <div className="card p-4"><div className="text-sm font-medium mb-2">1. Occasion</div><div className="flex flex-wrap gap-2">{OCCASIONS.map((x) => <button key={x.key} onClick={() => setOcc(x.key)} className={`px-3 py-1.5 rounded-full border text-sm ${occ === x.key ? 'bg-teal-900 text-white border-teal-900' : 'hover:bg-slate-50'}`}>{x.emoji} {x.title.en.replace(/^Happy /, '')}</button>)}</div></div>
          <div className="card p-4 space-y-3"><div className="text-sm font-medium">2. Wish</div>
            <div className="flex gap-2">{LANGS.map(([k, l]) => <button key={k} className={lang === k ? 'btn !py-1' : 'btn-quiet !py-1'} onClick={() => setLang(k)}>{l}</button>)}</div>
            <F l="Heading"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></F>
            <F l="Message"><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></F>
            <F l="Signed by"><input className="input" value={signer} onChange={(e) => setSigner(e.target.value)} /></F></div>
          <div className="card p-4 space-y-3"><div className="text-sm font-medium">3. Look</div>
            <div className="flex flex-wrap gap-2">{THEMES.map((t) => <button key={t.key} className={theme === t.key ? 'btn !py-1' : 'btn-quiet !py-1'} onClick={() => setTheme(t.key)}>{t.label}</button>)}</div>
            <div className="flex items-center gap-3 flex-wrap text-sm">{(['Main', 'Second', 'Accent'] as const).map((n, i) => <label key={n} className="flex items-center gap-1.5">{n}<input type="color" value={colours[i]} onChange={(e) => { const c = [...colours] as [string, string, string]; c[i] = e.target.value; setColours(c); }} /></label>)}<button className="underline text-xs" onClick={() => setColours(o.colours)}>reset colours</button></div>
            <F l="Picture size"><select className="input" value={fmt} onChange={(e) => setFmt(e.target.value)}>{FORMATS.map((x) => <option key={x.key} value={x.key}>{x.label} — {x.note}</option>)}</select></F>
            <div className="flex items-center gap-2 flex-wrap"><input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} /><button className="btn-quiet" onClick={() => photoInput.current?.click()}>{photo ? 'Change background photo' : 'Use my own background photo'}</button>{photo && <button className="underline text-sm" onClick={() => setPhoto(null)}>remove photo</button>}</div>
            <p className="text-xs text-slate-500">A photo stays on this computer; it is not uploaded. Do not use a photo of a child unless the parents have allowed it (see Photo consent).</p></div>
          <div className="card p-4"><div className="text-sm font-medium mb-2">4. Show on the picture</div><div className="grid grid-cols-2 gap-1.5 text-sm">{(['logo', 'tagline', 'phone', 'website', 'address', 'signer'] as const).map((k) => <label key={k} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={use[k]} onChange={(e) => setUse({ ...use, [k]: e.target.checked })} />{k === 'signer' ? 'Signed by' : k}</label>)}</div>
            {owner && <div className="mt-3 flex items-center gap-2 flex-wrap"><input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} /><button className="btn-quiet" onClick={() => logoInput.current?.click()}>{brand.logoId ? 'Change logo' : 'Upload your logo'}</button><span className="text-xs text-slate-500">PNG with a clear background looks best.</span></div>}</div>
        </div>
        <div className="xl:col-span-3 space-y-3">
          <div className="card p-3 grid place-items-center bg-slate-100"><canvas ref={canvas} className="max-w-full rounded shadow" style={{ maxHeight: 640, width: 'auto', height: 'auto' }} /></div>
          <div className="flex gap-2 flex-wrap"><button className="btn !text-base !px-6 !py-2.5" onClick={download}>⬇ Download picture</button>{typeof navigator !== 'undefined' && (navigator as any).canShare && <button className="btn-quiet !text-base !px-5" onClick={share}>Share…</button>}</div>
          {msg && <p className="text-sm text-moss">{msg}</p>}
          <div className="card p-4"><div className="flex items-center justify-between"><div className="font-medium">Caption with hashtags</div><button className="btn-quiet" onClick={copy}>Copy caption</button></div><textarea className="input mt-2" rows={9} value={cap} onChange={(e) => { setCap(e.target.value); setCapEdited(true); }} /><p className="text-xs text-slate-500 mt-1">Suggested hashtags: {hashtags(o, brand.name, brand.city).join(' ')}</p></div>
        </div>
      </div>
    </div>
  );
}
