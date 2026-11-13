import { fitFont, initials } from './postText';

export type Theme = 'gradient' | 'festive' | 'clean' | 'bold';
export type PostOpts = {
  w: number; h: number; theme: Theme; colours: [string, string, string];
  title: string; body: string; emoji: string; centre: string; tagline: string;
  phone: string; website: string; address: string; signer: string;
  showLogo: boolean; logo: HTMLImageElement | null; photo: HTMLImageElement | null;
};

const FONT = '"Segoe UI", "Nirmala UI", "Noto Sans", "Noto Sans Devanagari", "Mangal", Arial, sans-serif';
const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
const mix = (hex: string, to: string, t: number) => { const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16); const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join(''); };
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
const cover = (c: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) => { const k = Math.max(w / img.naturalWidth, h / img.naturalHeight); const dw = img.naturalWidth * k, dh = img.naturalHeight * k; c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh); };
function seeded(n: number) { let s = n; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

/** Draws the whole post on a canvas of w × h. Everything scales with s, so the same layout works for square, portrait, story and wide. */
export function drawPost(canvas: HTMLCanvasElement, o: PostOpts) {
  const { w, h } = o; canvas.width = w; canvas.height = h; const c = canvas.getContext('2d')!; const s = Math.min(w / 1080, (h / 1080) * 1.05); const [c1, c2, acc] = o.colours;
  const light = o.theme === 'clean' && !o.photo; const ink = light ? '#1f2937' : '#ffffff'; const wide = w > h;
  c.textBaseline = 'alphabetic'; c.textAlign = 'center';

  // ---- background
  if (o.photo) { cover(c, o.photo, w, h); const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, rgba('#000000', 0.62)); g.addColorStop(0.45, rgba('#000000', 0.5)); g.addColorStop(1, rgba('#000000', 0.78)); c.fillStyle = g; c.fillRect(0, 0, w, h); }
  else if (o.theme === 'gradient') { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.07)'; [[0.9, 0.12, 0.34], [0.05, 0.62, 0.26], [0.75, 0.92, 0.3]].forEach(([x, y, r]) => { c.beginPath(); c.arc(w * x, h * y, Math.min(w, h) * r, 0, 7); c.fill(); }); }
  else if (o.theme === 'festive') {
    c.fillStyle = mix(c2, '#000000', 0.55); c.fillRect(0, 0, w, h); const g = c.createRadialGradient(w / 2, h * 0.38, 10 * s, w / 2, h * 0.38, Math.max(w, h) * 0.7); g.addColorStop(0, rgba(c1, 0.95)); g.addColorStop(0.55, rgba(c1, 0.35)); g.addColorStop(1, rgba(c1, 0)); c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = seeded(w * 7 + h); for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, z = (1 + r() * 3.5) * s; c.fillStyle = rgba(acc, 0.25 + r() * 0.6); c.beginPath(); c.arc(x, y, z, 0, 7); c.fill(); }
    c.strokeStyle = rgba(acc, 0.85); c.lineWidth = 6 * s; rr(c, 26 * s, 26 * s, w - 52 * s, h - 52 * s, 28 * s); c.stroke(); c.strokeStyle = rgba(acc, 0.35); c.lineWidth = 2 * s; rr(c, 44 * s, 44 * s, w - 88 * s, h - 88 * s, 20 * s); c.stroke();
  } else if (o.theme === 'clean') { c.fillStyle = '#FFFBF5'; c.fillRect(0, 0, w, h); c.fillStyle = rgba(c1, 0.07); c.beginPath(); c.arc(w * 0.92, h * 0.5, Math.min(w, h) * 0.38, 0, 7); c.fill(); c.beginPath(); c.arc(w * 0.04, h * 0.7, Math.min(w, h) * 0.22, 0, 7); c.fill(); }
  else { c.fillStyle = c1; c.fillRect(0, 0, w, h); c.fillStyle = c2; c.beginPath(); c.moveTo(w, h * 0.45); c.lineTo(w, h); c.lineTo(w * 0.35, h); c.closePath(); c.fill(); c.fillStyle = rgba(acc, 0.9); c.fillRect(0, h * 0.45 - 12 * s, 150 * s, 12 * s); }

  // ---- header: logo + name + tagline
  const headH = (wide ? 120 : 190) * s; const pad = 56 * s;
  if (o.theme === 'clean' && !o.photo) { c.fillStyle = c1; c.fillRect(0, 0, w, headH); } else if (o.theme !== 'festive') { c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(0, 0, w, headH); }
  const headInk = o.theme === 'clean' && !o.photo ? '#ffffff' : '#ffffff'; let tx = pad;
  if (o.showLogo) {
    const L = headH - 44 * s; const lx = pad, ly = (headH - L) / 2; c.fillStyle = '#ffffff'; rr(c, lx, ly, L, L, 18 * s); c.fill();
    if (o.logo && o.logo.naturalWidth) { const k = Math.min((L - 16 * s) / o.logo.naturalWidth, (L - 16 * s) / o.logo.naturalHeight); const dw = o.logo.naturalWidth * k, dh = o.logo.naturalHeight * k; c.drawImage(o.logo, lx + (L - dw) / 2, ly + (L - dh) / 2, dw, dh); }
    else { c.fillStyle = c1; c.font = `800 ${L * 0.42}px ${FONT}`; c.fillText(initials(o.centre), lx + L / 2, ly + L / 2 + L * 0.15); }
    tx = lx + L + 28 * s;
  }
  c.textAlign = 'left'; const nameW = w - tx - pad; const nm = fitFont(o.centre, nameW, 2, 46 * s, 26 * s, (z, t) => { c.font = `800 ${z}px ${FONT}`; return c.measureText(t).width; });
  const hasTag = !!o.tagline.trim(); const blockH = nm.lines.length * nm.size * 1.15 + (hasTag ? 36 * s : 0); let ty = (headH - blockH) / 2 + nm.size * 0.95;
  c.fillStyle = headInk; c.font = `800 ${nm.size}px ${FONT}`; nm.lines.forEach((ln) => { c.fillText(ln, tx, ty); ty += nm.size * 1.15; });
  if (hasTag) { c.font = `500 ${26 * s}px ${FONT}`; c.fillStyle = rgba(headInk, 0.85); c.fillText(o.tagline.slice(0, 70), tx, ty - nm.size * 0.15 + 8 * s); }
  c.textAlign = 'center';

  // ---- footer: contact details
  const contact = [o.phone && `📞 ${o.phone}`, o.website && `🌐 ${o.website}`].filter(Boolean).join('    ');
  const addr = o.address.trim(); const footH = (contact && addr ? 150 : contact || addr ? 108 : 40) * s * (wide ? 0.8 : 1);
  if (footH > 60 * s) { c.fillStyle = o.theme === 'clean' && !o.photo ? c2 : 'rgba(0,0,0,.35)'; c.fillRect(0, h - footH, w, footH); }
  let fy = h - footH + (contact && addr ? 56 : 66) * s * (wide ? 0.8 : 1);
  if (contact) { c.fillStyle = '#ffffff'; c.font = `700 ${(wide ? 28 : 34) * s}px ${FONT}, ${EMOJI}`; c.fillText(contact, w / 2, fy); fy += 46 * s; }
  if (addr) { const a = fitFont(addr, w - 2 * pad, 2, 26 * s, 18 * s, (z, t) => { c.font = `500 ${z}px ${FONT}`; return c.measureText(t).width; }); c.fillStyle = 'rgba(255,255,255,.9)'; c.font = `500 ${a.size}px ${FONT}, ${EMOJI}`; a.lines.forEach((ln, i) => c.fillText((i === 0 ? '📍 ' : '') + ln, w / 2, fy + i * a.size * 1.25)); }

  // ---- middle: emoji, title, line, message, signer. Sizes are tried from big to small until everything fits the space between header and footer.
  const top = headH + 20 * s, bottom = h - footH - (o.signer ? 70 : 20) * s; const midH = bottom - top; const cx = w / 2; const maxW = w - 2 * pad - (wide ? 40 : 60) * s;
  const boost = wide ? 1.5 : h > w * 1.3 ? 1.3 : 1; const gap = 26 * s; const accTxt = lum(acc) < 0.35 ? '#ffffff' : acc; // a dark accent (e.g. navy) cannot be read on a dark picture
  let k = 1, emojiSize = 0, t = fitFont(o.title, maxW, 2, 10, 10, () => 0), b = t, total = 0;
  for (; k >= 0.5; k -= 0.05) {
    emojiSize = wide ? 0 : Math.min(midH * 0.2, 170 * s * boost) * k;
    t = fitFont(o.title, maxW, 2, (wide ? 96 : 124) * s * boost * k, 40 * s, (z, x) => { c.font = `800 ${z}px ${FONT}`; return c.measureText(x).width; });
    b = fitFont(o.body, maxW * 0.94, wide ? 5 : 8, (wide ? 34 : 44) * s * boost * k, 22 * s, (z, x) => { c.font = `500 ${z}px ${FONT}`; return c.measureText(x).width; });
    total = (emojiSize ? emojiSize + gap : 0) + t.lines.length * t.size * 1.12 + 18 * s + gap + b.lines.length * b.size * 1.4; if (total <= midH) break;
  }
  const tH = t.lines.length * t.size * 1.12; let y = top + Math.max(0, (midH - total) / 2);
  if (emojiSize) { if (o.emoji === '🇮🇳') drawFlag(c, cx, y + emojiSize * 0.5, emojiSize); else { c.font = `${emojiSize}px ${EMOJI}, ${FONT}`; c.fillStyle = ink; c.fillText(o.emoji, cx, y + emojiSize * 0.86); } y += emojiSize + gap; }
  c.fillStyle = light ? c1 : o.theme === 'festive' ? accTxt : '#ffffff'; c.font = `800 ${t.size}px ${FONT}`; t.lines.forEach((ln, i) => c.fillText(ln, cx, y + t.size * 0.9 + i * t.size * 1.12)); y += tH;
  c.fillStyle = light ? c2 : accTxt; rr(c, cx - 70 * s, y + 4 * s, 140 * s, 8 * s, 4 * s); c.fill(); y += 18 * s + gap;
  c.fillStyle = ink; c.font = `500 ${b.size}px ${FONT}`; b.lines.forEach((ln, i) => c.fillText(ln, cx, y + b.size * 0.95 + i * b.size * 1.4));
  if (o.signer) { c.fillStyle = light ? c2 : accTxt; c.font = `700italic ${34 * s * (wide ? 1.1 : 1)}px ${FONT}`; c.fillText(`— ${o.signer}`, cx, h - footH - 26 * s); }
}

/** Relative brightness 0..1 of a #rrggbb colour. */
function lum(hex: string) { const n = parseInt(hex.slice(1), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }
/** The Indian flag drawn with shapes (flag emoji do not exist on Windows): saffron, white, green and a blue wheel. size = its height. */
function drawFlag(c: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const fw = size * 1.5, fh = size, x = cx - fw / 2, y = cy - fh / 2; c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = size * 0.1; c.fillStyle = '#FF9933'; c.fillRect(x, y, fw, fh / 3); c.fillStyle = '#FFFFFF'; c.fillRect(x, y + fh / 3, fw, fh / 3); c.fillStyle = '#138808'; c.fillRect(x, y + (2 * fh) / 3, fw, fh / 3); c.restore();
  const r = fh / 7; c.strokeStyle = '#000080'; c.fillStyle = '#000080'; c.lineWidth = Math.max(1, r * 0.12); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); for (let i = 0; i < 24; i++) { const a = (i * Math.PI) / 12; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); c.stroke(); } c.beginPath(); c.arc(cx, cy, r * 0.12, 0, 7); c.fill();
}

export const THEMES: { key: Theme; label: string }[] = [{ key: 'gradient', label: 'Colourful' }, { key: 'festive', label: 'Festive glow' }, { key: 'clean', label: 'Clean' }, { key: 'bold', label: 'Bold' }];
