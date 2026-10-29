/** Colour theme and font are personal choices kept on the device (localStorage). index.html applies them before the first paint. */
export type ThemeId = 'classic' | 'crimson' | 'forest' | 'midnight';
export const THEMES: { id: ThemeId; name: string; note: string; bar: string; btn: string; radius: string }[] = [
  { id: 'classic', name: 'Classic', note: 'The usual NextEdge blue', bar: '#11343C', btn: '#1673D9', radius: '6px' },
  { id: 'crimson', name: 'Crimson', note: 'Soft cards, round buttons', bar: '#8B0B3A', btn: '#D81B5C', radius: '9999px' },
  { id: 'forest', name: 'Forest', note: 'Calm green, tile buttons', bar: '#264A2A', btn: '#4C7C4A', radius: '14px' },
  { id: 'midnight', name: 'Midnight', note: 'Dark, glowing blue', bar: '#0A0D12', btn: 'linear-gradient(135deg,#2250D6,#2C70EC)', radius: '12px' },
];
/** Five fonts. Poppins, Noto Sans and Mukta also draw Hindi (Devanagari) well. */
export const FONTS = [
  { id: 'Poppins', note: 'Round and friendly' },
  { id: 'Montserrat', note: 'Wide and modern' },
  { id: 'Outfit', note: 'Clean, geometric' },
  { id: 'Noto Sans', note: 'Neutral, very readable' },
  { id: 'Mukta', note: 'Made for Hindi and English' },
] as const;
export type FontId = (typeof FONTS)[number]['id'];
const KT = 'ne.theme'; const KF = 'ne.font';
const ok = <T extends string>(v: string | null, list: readonly { id: T }[]): T | null => (list.find((x) => x.id === v)?.id as T) ?? null;

export function getPrefs(): { theme: ThemeId; font: FontId | null } {
  let t: string | null = null; let f: string | null = null; try { t = localStorage.getItem(KT); f = localStorage.getItem(KF); } catch { /* private mode */ }
  return { theme: ok(t, THEMES) ?? 'classic', font: ok(f, FONTS) };
}
export function applyPrefs(p = getPrefs()) {
  const r = document.documentElement; if (p.theme === 'classic') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', p.theme);
  if (p.font) r.style.setProperty('--font-body', `'${p.font}', 'Noto Sans', system-ui, sans-serif`); else r.style.removeProperty('--font-body');
}
export function setTheme(id: ThemeId) { try { if (id === 'classic') localStorage.removeItem(KT); else localStorage.setItem(KT, id); } catch { /* ignore */ } applyPrefs(); }
export function setFont(id: FontId | null) { try { if (id) localStorage.setItem(KF, id); else localStorage.removeItem(KF); } catch { /* ignore */ } applyPrefs(); }
