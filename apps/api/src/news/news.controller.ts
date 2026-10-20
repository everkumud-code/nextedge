import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/auth.guard';

/** Free current-affairs feed: public RSS (Google News search feeds + PIB). No API keys, no cost. Cached 30 minutes per category. */
type Item = { title: string; link: string; source: string; publishedAt: string; summary: string };
const FEEDS: Record<string, { label: string; urls: string[] }> = {
  'current-affairs': { label: 'Current affairs', urls: ['https://news.google.com/rss/search?q=current+affairs+India+when:1d&hl=en-IN&gl=IN&ceid=IN:en', 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3'] },
  'exams': { label: 'Exams & education', urls: ['https://news.google.com/rss/search?q=(JEE+OR+NEET+OR+CBSE+OR+UPSC+OR+JAC+board)+when:2d&hl=en-IN&gl=IN&ceid=IN:en'] },
  'science-tech': { label: 'Science & technology', urls: ['https://news.google.com/rss/search?q=ISRO+OR+science+OR+technology+India+when:2d&hl=en-IN&gl=IN&ceid=IN:en'] },
  'economy': { label: 'Economy & business', urls: ['https://news.google.com/rss/search?q=India+economy+OR+RBI+OR+budget+when:2d&hl=en-IN&gl=IN&ceid=IN:en'] },
  'sports': { label: 'Sports', urls: ['https://news.google.com/rss/search?q=India+sports+when:1d&hl=en-IN&gl=IN&ceid=IN:en'] },
  'jharkhand': { label: 'Jharkhand', urls: ['https://news.google.com/rss/search?q=Jharkhand+OR+Ranchi+when:2d&hl=en-IN&gl=IN&ceid=IN:en'] },
  'hindi': { label: 'हिन्दी समाचार', urls: ['https://news.google.com/rss/search?q=%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4+when:1d&hl=hi&gl=IN&ceid=IN:hi'] },
};
const cache = new Map<string, { at: number; items: Item[] }>();
const strip = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, '’').replace(/&nbsp;/g, ' ').trim();
function parse(xml: string): Item[] {
  const out: Item[] = []; const re = /<item>([\s\S]*?)<\/item>/g; let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) { const b = m[1]; const g = (t: string) => { const r = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`).exec(b); return r ? strip(r[1]) : ''; };
    const title = g('title'); if (!title) continue; const src = g('source') || (title.includes(' - ') ? title.split(' - ').pop()! : 'PIB');
    out.push({ title: title.replace(/ - [^-]+$/, ''), link: g('link') || (/<guid[^>]*>([^<]+)</.exec(b)?.[1] || ''), source: src, publishedAt: new Date(g('pubDate') || Date.now()).toISOString(), summary: g('description').slice(0, 220) }); }
  return out;
}

@Controller('news')
export class NewsController {
  @Public() @Get('categories') categories() { return Object.entries(FEEDS).map(([key, f]) => ({ key, label: f.label })); }

  /** ?category=current-affairs (default). Extra feeds via NEWS_EXTRA_FEEDS="label|url;label|url". */
  @Public() @Get() async list(@Query('category') category = 'current-affairs') {
    const f = FEEDS[category] || FEEDS['current-affairs']; const c = cache.get(category); if (c && Date.now() - c.at < 30 * 60_000) return { category, label: f.label, items: c.items, cachedAt: new Date(c.at).toISOString() };
    const items: Item[] = [];
    for (const url of f.urls) { try { const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'NextEdge/1.0' } }); if (res.ok) items.push(...parse(await res.text())); } catch (e) { console.warn('news feed failed', url); } }
    const seen = new Set<string>(); const uniq = items.filter((i) => { const k = i.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 40);
    if (uniq.length) cache.set(category, { at: Date.now(), items: uniq });
    return { category, label: f.label, items: uniq.length ? uniq : c?.items || [], cachedAt: new Date().toISOString() };
  }

  /** One-line "today" strip: IST date + time, for the app header. */
  @Public() @Get('today') today() { const ist = new Date(Date.now() + 5.5 * 3600e3); return { date: ist.toISOString().slice(0, 10), time: ist.toISOString().slice(11, 16), weekday: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ist.getUTCDay()], tz: 'Asia/Kolkata' }; }
}
