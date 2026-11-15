import { useEffect, useRef, useState } from 'react';
import LangSwitch from './LangSwitch';
import ThemePicker from './ThemePicker';

/** One "Settings" button for everything that is a personal preference (language, colours, buttons, font). Same for every login. */
export default function SettingsMenu() {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={box} className="relative" data-testid="settings-menu">
      <button type="button" data-testid="settings-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} className="w-full px-5 py-3 text-left text-sm text-teal-100/80 hover:text-white border-t border-teal-800 flex items-center justify-between">
        <span><span aria-hidden="true">⚙</span> Settings</span><span aria-hidden="true" className="text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Settings" data-testid="settings-panel" className="absolute bottom-full left-2 mb-1 w-[260px] rounded-lg bg-teal-900 border border-teal-700 shadow-xl text-teal-100 z-50">
          <div className="px-4 py-3"><div className="text-[10px] uppercase tracking-wider text-teal-100/60 mb-2">Language</div><LangSwitch dark /></div>
          <ThemePicker />
        </div>
      )}
    </div>
  );
}
