// Reads a photo of a register / list (or a scanned PDF) with an AI vision model and returns the rows as plain objects. Needs ANTHROPIC_API_KEY on the server.
import { KINDS } from './parse';

export const aiReady = () => !!process.env.ANTHROPIC_API_KEY;
const PROMPT = (kind: string) => {
  const k = KINDS[kind]; const keys = k.fields.map((f) => `"${f.key}" (${f.label})`).join(', ');
  return `This is a photo or scan of a ${k.label.toLowerCase()} list from an Indian school or coaching centre (a register, a printed sheet or a handwritten list). Read every row of the table.
Return ONLY a JSON array, no other text. Each element is an object with only these keys: ${keys}.
Rules: copy exactly what is written; do not invent or guess values; use "" when a value is missing or not readable; keep names in the spelling shown; mobile numbers are 10 digits; write dates as written. Skip header rows, totals and blank rows. If there is no table, return [].`;
};
export function parseAiJson(text: string): Record<string, any>[] {
  const t = String(text || '').replace(/```json|```/g, ''); const a = t.indexOf('['); const b = t.lastIndexOf(']'); if (a < 0 || b < a) throw new Error('The AI reader did not find a table in this image');
  let arr: any; try { arr = JSON.parse(t.slice(a, b + 1)); } catch { throw new Error('The AI reader returned something that could not be understood. Try a clearer photo.'); }
  if (!Array.isArray(arr)) throw new Error('The AI reader did not return a list'); return arr.filter((x) => x && typeof x === 'object');
}
export async function extractWithAi(kind: string, mime: string, base64: string): Promise<Record<string, any>[]> {
  if (!aiReady()) throw new Error('Reading a photo needs an AI key on the server (ANTHROPIC_API_KEY). Ask the platform team to add it, or upload an Excel/CSV/Word file instead.');
  const isPdf = mime === 'application/pdf'; const block = isPdf ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };
  const res = await fetch(`${process.env.AI_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-sonnet-4-6', max_tokens: 8000, messages: [{ role: 'user', content: [block, { type: 'text', text: PROMPT(kind) }] }] }) });
  const j: any = await res.json().catch(() => ({})); if (!res.ok) throw new Error(`AI reader: ${j?.error?.message || res.status}`);
  return parseAiJson((j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n'));
}
