import { useState } from 'react';
import { hasChosenLang, setLang, type Lang } from '../i18n';

const CHOICES: [Lang, string, string][] = [['en', 'English', 'Continue in English'], ['hi', 'हिन्दी', 'हिन्दी में जारी रखें'], ['hn', 'Hinglish', 'Hinglish mein jaari rakhein']];
/** Asked once, the first time someone signs in on a device. The choice is saved, so it is never asked again unless they clear the browser; they can change it any time from the side menu. */
export default function LangPrompt() {
  const [open, setOpen] = useState(() => !hasChosenLang());
  if (!open) return null;
  return (
    <div data-no-i18n className="fixed inset-0 z-[100] bg-black/60 grid place-items-center px-4" role="dialog" aria-modal="true" aria-label="Choose your language">
      <div className="card p-6 w-full max-w-sm bg-white text-slate-900">
        <h2 className="text-lg font-bold">Choose your language</h2>
        <p className="text-sm text-slate-600">अपनी भाषा चुनें · Apni bhasha chunein</p>
        <div className="mt-4 space-y-2">
          {CHOICES.map(([k, name, hint]) => <button key={k} type="button" className="w-full text-left border rounded-lg px-4 py-3 hover:border-teal-700 hover:bg-teal-50" onClick={() => { setLang(k); setOpen(false); }}><div className="font-semibold">{name}</div><div className="text-xs text-slate-500">{hint}</div></button>)}
        </div>
        <p className="text-xs text-slate-500 mt-3">You can change this any time from the menu. · आप इसे कभी भी मेन्यू से बदल सकते हैं।</p>
      </div>
    </div>
  );
}
