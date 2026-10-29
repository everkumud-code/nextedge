import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import fs from 'fs';
import path from 'path';
import ThemePicker from '../src/components/ThemePicker';
import { applyPrefs, getPrefs, setFont, setTheme, THEMES, FONTS } from '../src/lib/theme';

const css = fs.readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8');
const tw = fs.readFileSync(path.resolve(__dirname, '../tailwind.config.js'), 'utf8');
function blocks() { const out: Record<string, Record<string, string>> = {}; for (const m of css.matchAll(/(:root|\[data-theme='(\w+)'\])\s*\{([^}]*)\}/g)) { const id = m[2] || 'classic'; out[id] ||= {}; for (const v of m[3].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[id][v[1]] = v[2].trim(); } return out; }
const B = blocks(); const val = (theme: string, k: string) => B[theme]?.[k] ?? B.classic[k];
const rgb = (s: string) => s.split(/\s+/).slice(0, 3).map(Number) as [number, number, number];
const lum = ([r, g, b]: number[]) => { const f = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const ids = ['classic', 'crimson', 'forest', 'midnight'];

beforeEach(() => { cleanup(); localStorage.clear(); applyPrefs(); });

describe('theme palette (static checks on index.css)', () => {
  it(':root gives --font-body a default (otherwise the font-family rule is dropped and the whole panel turns serif)', () => {
    expect(B.classic['font-body'], '--font-body must have a default in :root').toBeTruthy(); expect(tw).toContain("var(--font-body)");
  });
  it('every colour the Tailwind config reads exists in :root as an RGB triplet', () => {
    const used = [...tw.matchAll(/v\('([a-z0-9-]+)'\)/g)].map((m) => m[1]); expect(used.length).toBeGreaterThan(15);
    for (const k of used) expect(B.classic[k], `--${k} missing in :root`).toMatch(/^\d+ \d+ \d+$/);
  });
  it('each theme sets the full palette, not half of it', () => {
    const need = ['paper', 'ink', 'line', 'muted', 'teal-100', 'teal-200', 'teal-700', 'teal-800', 'teal-900', 'edge-50', 'edge-100', 'edge-500', 'edge-600', 'edge-700', 'marigold-100', 'marigold-500', 'marigold-600', 'btn-radius', 'btn-shadow', 'card-radius', 'card-shadow', 'input-radius'];
    for (const t of ['crimson', 'forest', 'midnight']) for (const k of need) expect(B[t][k], `${t} lacks --${k}`).toBeTruthy();
    expect(B.midnight['surface']).toBeTruthy(); expect(B.midnight['btn-bg']).toContain('gradient');
  });
  it('the three themes really differ in button shape', () => {
    expect(B.crimson['btn-radius']).toBe('9999px'); expect(B.forest['btn-radius']).toBe('14px'); expect(B.midnight['btn-radius']).toBe('12px'); expect(B.classic['btn-radius']).toBe('6px');
  });
  it('text stays readable: body text, button text, sidebar text, muted text', () => {
    for (const t of ids) {
      const paper = rgb(val(t, 'paper')), ink = rgb(val(t, 'ink')), surface = rgb(val(t, 'surface')), muted = rgb(val(t, 'muted'));
      expect(ratio(ink, paper), `${t}: ink on paper`).toBeGreaterThanOrEqual(7);
      expect(ratio(muted, surface), `${t}: muted on surface`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb(val(t, 'teal-100')), rgb(val(t, 'teal-900'))), `${t}: sidebar text`).toBeGreaterThanOrEqual(7);
      const t100 = rgb(val(t, 'teal-100')), t900 = rgb(val(t, 'teal-900')); const dim = t100.map((c, i) => 0.8 * c + 0.2 * t900[i]);
      expect(ratio(dim, t900), `${t}: dimmed sidebar text (80%)`).toBeGreaterThanOrEqual(4.5);
      expect(ratio([255, 255, 255], rgb(val(t, 'teal-800'))), `${t}: white on active menu item`).toBeGreaterThanOrEqual(4.5);
      const bg = val(t, 'btn-bg'), hv = val(t, 'btn-bg-hover'); const white = [255, 255, 255];
      const cols = (s: string) => (s.includes('gradient') ? [...s.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => hex(m[0])) : [rgb(t === 'classic' ? val(t, 'edge-500') : val(t, 'edge-500'))]);
      for (const c of [...cols(bg), ...cols(hv.includes('gradient') ? hv : bg)]) expect(ratio(white, c), `${t}: white text on button ${c}`).toBeGreaterThanOrEqual(4.5);
      const hoverRgb = hv.startsWith('rgb(var(--edge-600))') ? rgb(val(t, 'edge-600')) : null; if (hoverRgb) expect(ratio(white, hoverRgb), `${t}: white on hover`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('theme picker', () => {
  it('opens, lists 4 looks and exactly 5 fonts', () => {
    const r = render(<ThemePicker />); fireEvent.click(r.getByText('Colours and font'));
    expect(r.getAllByRole('radio').length).toBe(4 + 5); expect(FONTS.length).toBe(5); expect(THEMES.length).toBe(4);
    expect(r.getByRole('radiogroup', { name: 'Colour theme' })).toBeTruthy(); expect(r.getByRole('radiogroup', { name: 'Font' })).toBeTruthy();
  });
  it('choosing each look sets data-theme, is remembered, and Classic clears it', () => {
    const r = render(<ThemePicker />); fireEvent.click(r.getByText('Colours and font'));
    for (const t of ['crimson', 'forest', 'midnight']) { fireEvent.click(r.getByTestId(`theme-${t}`)); expect(document.documentElement.getAttribute('data-theme')).toBe(t); expect(localStorage.getItem('ne.theme')).toBe(t); expect(r.getByTestId(`theme-${t}`).getAttribute('aria-checked')).toBe('true'); }
    fireEvent.click(r.getByTestId('theme-classic')); expect(document.documentElement.hasAttribute('data-theme')).toBe(false); expect(localStorage.getItem('ne.theme')).toBeNull();
  });
  it('choosing each of the five fonts sets the font variable and is remembered', () => {
    const r = render(<ThemePicker />); fireEvent.click(r.getByText('Colours and font'));
    for (const f of FONTS) { fireEvent.click(r.getByTestId(`font-${f.id.replace(/\s/g, '')}`)); expect(document.documentElement.style.getPropertyValue('--font-body')).toContain(`'${f.id}'`); expect(localStorage.getItem('ne.font')).toBe(f.id); }
  });
  it('a saved choice comes back after a reload; junk values are ignored', () => {
    setTheme('forest'); setFont('Mukta'); document.documentElement.removeAttribute('data-theme'); document.documentElement.style.removeProperty('--font-body'); applyPrefs();
    expect(document.documentElement.getAttribute('data-theme')).toBe('forest'); expect(document.documentElement.style.getPropertyValue('--font-body')).toContain('Mukta');
    localStorage.setItem('ne.theme', '<script>'); localStorage.setItem('ne.font', 'Comic Sans'); expect(getPrefs()).toEqual({ theme: 'classic', font: null });
  });
  it('the reset link returns to the original look', () => {
    const r = render(<ThemePicker />); fireEvent.click(r.getByText('Colours and font')); fireEvent.click(r.getByTestId('theme-midnight')); fireEvent.click(r.getByTestId('font-Poppins'));
    fireEvent.click(r.getByTestId('theme-reset')); expect(localStorage.getItem('ne.theme')).toBeNull(); expect(localStorage.getItem('ne.font')).toBeNull(); expect(document.documentElement.style.getPropertyValue('--font-body')).toBe('');
  });
});
