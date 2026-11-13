/**
 * Three languages for every user: English, Hindi (Devanagari) and Hinglish (Hindi in Roman letters).
 *
 * Sentences are translated as whole sentences (see the dictionary files), never word by word. The translator works on the screen itself:
 * any text it has a translation for is replaced, anything else stays in English, so a missing sentence can never break a page.
 * English is the default. The first time someone signs in on a device they are asked once (LangPrompt); after that the choice is remembered on the device
 * and only changes when they change it themselves, from the login page or the side menu.
 */
import { useEffect, useState } from 'react';
import { CORE } from './dict-core';
import { PEOPLE } from './dict-people';
import { MONEY } from './dict-money';
import { SCHOOL } from './dict-school';
import { OFFICE } from './dict-office';
import { PAGES } from './dict-pages';
import { COMPLIANCE } from './dict-compliance';
import { OFFERS } from './dict-offers';
import { LIBRARY } from './dict-library';
import { ROLES } from './dict-roles';
import { LIVE } from './dict-live';
import { MORE } from './dict-more';

export type Lang = 'en' | 'hi' | 'hn';
const KEY = 'ne_lang';
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const MAP = new Map<string, [string, string]>();
// Sentences with a changing part are written with {n}: "{n} open doubts" matches "3 open doubts" and keeps the 3.
const PATS: { re: RegExp; names: string[]; hi: string; hn: string }[] = [];
for (const raw of [CORE, PEOPLE, MONEY, SCHOOL, OFFICE, PAGES, MORE, COMPLIANCE, OFFERS, LIBRARY, ROLES, LIVE]) for (const line of raw.split('\n')) {
  const p = line.split(' | '); if (p.length < 3) continue; const en = norm(p[0]); if (!en) continue; const hi = p[1].trim(), hn = p.slice(2).join(' | ').trim();
  if (en.includes('{')) { const names: string[] = []; const src = en.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (_m, nm) => { names.push(nm); return '(.+?)'; }); PATS.push({ re: new RegExp('^' + src + '$'), names, hi, hn }); }
  else MAP.set(en, [hi, hn]);
}

const read = (): Lang => { try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'hi' || v === 'hn') return v; } catch { /* private mode */ } return 'en'; };
/** True once this device has a saved choice. The first-login question is asked only while this is false; storage that cannot be read counts as chosen, so nobody is asked on every visit. */
export const hasChosenLang = () => { try { const v = localStorage.getItem(KEY); return v === 'en' || v === 'hi' || v === 'hn'; } catch { return true; } };
let lang: Lang = read();
const listeners = new Set<() => void>();
export const getLang = () => lang;
export function translate(s: string, l: Lang = lang): string {
  if (l === 'en') return s; const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/); if (!m || !m[2]) return s;
  const core = norm(m[2]); const hit = MAP.get(core);
  if (hit) return m[1] + (l === 'hi' ? hit[0] : hit[1]) + m[3];
  for (const pt of PATS) { const mm = core.match(pt.re); if (!mm) continue; let out = l === 'hi' ? pt.hi : pt.hn; pt.names.forEach((nm, i) => { out = out.split('{' + nm + '}').join(mm[i + 1]); }); return m[1] + out + m[3]; }
  return s;
}
/** For text built in code (messages, labels): t('Save') -> the sentence in the chosen language. */
export const t = (s: string) => translate(s);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const origText = new WeakMap<Node, string>(); const shownText = new WeakMap<Node, string>();
const origAttr = new WeakMap<Element, Record<string, string>>(); const shownAttr = new WeakMap<Element, Record<string, string>>();
const skipped = (n: Node) => { for (let e: Node | null = n.nodeType === 1 ? n : n.parentNode; e && e.nodeType === 1; e = e.parentNode) { const el = e as Element; if (SKIP_TAGS.has(el.tagName) || el.hasAttribute('data-no-i18n') || (el as HTMLElement).isContentEditable) return true; } return false; };

function doText(n: Text) {
  if (skipped(n)) return; const cur = n.data; if (shownText.get(n) !== cur) origText.set(n, cur);
  const o = origText.get(n) ?? cur; const out = translate(o); shownText.set(n, out); if (out !== cur) n.data = out;
}
const attrBlocked = (el: Element) => !!el.closest('[data-no-i18n]') || (el as HTMLElement).isContentEditable;
function doAttrs(el: Element) {
  if (attrBlocked(el)) return; let so = origAttr.get(el); let sh = shownAttr.get(el);
  for (const a of ATTRS) { const cur = el.getAttribute(a); if (cur == null) continue; if (!so) { so = {}; origAttr.set(el, so); } if (!sh) { sh = {}; shownAttr.set(el, sh); } if (sh[a] !== cur) so[a] = cur; const out = translate(so[a] ?? cur); sh[a] = out; if (out !== cur) el.setAttribute(a, out); }
}
function walk(root: Node) {
  if (root.nodeType === 3) { doText(root as Text); return; } if (root.nodeType !== 1) return;
  doAttrs(root as Element); if (SKIP_TAGS.has((root as Element).tagName)) return; const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) doText(n as Text); else doAttrs(n as Element); }
}
let observer: MutationObserver | null = null;
export function startTranslator() {
  if (observer || typeof document === 'undefined') return; document.documentElement.lang = lang === 'hi' ? 'hi' : lang === 'hn' ? 'hi-Latn' : 'en';
  walk(document.body);
  observer = new MutationObserver((muts) => { for (const m of muts) { if (m.type === 'characterData') doText(m.target as Text); else if (m.type === 'attributes') doAttrs(m.target as Element); else m.addedNodes.forEach((x) => walk(x)); } });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
export function setLang(l: Lang) {
  lang = l; try { localStorage.setItem(KEY, l); } catch { /* ignore */ } document.documentElement.lang = l === 'hi' ? 'hi' : l === 'hn' ? 'hi-Latn' : 'en';
  walk(document.body); listeners.forEach((f) => f());
}
export function useLang(): Lang { const [l, setL] = useState(lang); useEffect(() => { const f = () => setL(lang); listeners.add(f); return () => { listeners.delete(f); }; }, []); return l; }
export const dictionarySize = () => MAP.size;
