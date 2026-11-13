import { setLang, useLang, type Lang } from '../i18n';

const OPTIONS: [Lang, string][] = [['hn', 'Hinglish'], ['hi', 'हिन्दी'], ['en', 'English']];
/** Language choice for every user: Hinglish, Hindi or English. Remembered on this device. */
export default function LangSwitch({ dark = false }: { dark?: boolean }) {
  const lang = useLang();
  return (
    <div data-no-i18n className="inline-flex rounded-md overflow-hidden border border-current/30 text-xs" role="group" aria-label="Language">
      {OPTIONS.map(([k, label]) => <button key={k} type="button" onClick={() => setLang(k)} aria-pressed={lang === k}
        className={`px-2.5 py-1 ${lang === k ? (dark ? 'bg-white text-teal-900 font-semibold' : 'bg-teal-900 text-white font-semibold') : 'opacity-80 hover:opacity-100'}`}>{label}</button>)}
    </div>
  );
}
