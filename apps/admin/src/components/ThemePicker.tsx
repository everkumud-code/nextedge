import { useState } from 'react';
import { FONTS, THEMES, getPrefs, setFont, setTheme, type FontId, type ThemeId } from '../lib/theme';

/** "Look" button: pick one of three colour and button themes (plus Classic) and one of five fonts. Everyone can use it; the choice stays on this device. */
export default function ThemePicker({ up = true, floating = false }: { up?: boolean; floating?: boolean }) {
  const [open, setOpen] = useState(false); const [p, setP] = useState(getPrefs());
  const pickTheme = (id: ThemeId) => { setTheme(id); setP(getPrefs()); }; const pickFont = (id: FontId | null) => { setFont(id); setP(getPrefs()); };
  return (
    <div className="relative" data-testid="theme-picker">
      <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} className={floating ? 'px-3 py-1.5 rounded-full text-xs text-teal-100 border border-teal-100/40 hover:bg-white/10' : 'px-5 py-3 text-left text-sm text-teal-100/80 hover:text-white border-t border-teal-800 w-full'}>Colours and font</button>
      {open && (
        <div role="dialog" aria-label="Colours and font" className={`absolute z-50 ${floating ? 'right-0' : 'left-2'} w-[300px] card p-4 shadow-xl text-ink ${up ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
          <div className="flex items-center justify-between"><b className="text-sm">Colours and buttons</b><button type="button" aria-label="Close" className="text-slate-400 hover:text-ink" onClick={() => setOpen(false)}>✕</button></div>
          <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 gap-2 mt-2">
            {THEMES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={p.theme === t.id} data-testid={`theme-${t.id}`} onClick={() => pickTheme(t.id)} className={`text-left rounded-lg border p-2 ${p.theme === t.id ? 'border-edge-500 ring-2 ring-edge-100' : 'border-slate-200'}`}>
                <div className="h-6 rounded" style={{ background: t.bar }} />
                <div className="mt-2 inline-block px-3 py-1 text-[11px] font-semibold text-white" style={{ background: t.btn, borderRadius: t.radius }}>Button</div>
                <div className="text-sm font-semibold mt-1">{t.name}</div><div className="text-[11px] text-slate-500 leading-tight">{t.note}</div>
              </button>
            ))}
          </div>
          <b className="text-sm block mt-4">Font</b>
          <div role="radiogroup" aria-label="Font" className="mt-2 space-y-1">
            {FONTS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={p.font === f.id} data-testid={`font-${f.id.replace(/\s/g, '')}`} onClick={() => pickFont(f.id)} className={`w-full text-left rounded-md border px-3 py-1.5 flex items-baseline justify-between ${p.font === f.id ? 'border-edge-500 bg-edge-50' : 'border-slate-200'}`}>
                <span style={{ fontFamily: `'${f.id}', 'Noto Sans', sans-serif` }} className="text-base">{f.id} <span className="text-slate-500">अआइ</span></span><span className="text-[11px] text-slate-500">{f.note}</span>
              </button>
            ))}
          </div>
          <button type="button" data-testid="theme-reset" className="mt-3 text-xs underline text-slate-500" onClick={() => { pickTheme('classic'); pickFont(null); }}>Back to the original look</button>
        </div>
      )}
    </div>
  );
}
