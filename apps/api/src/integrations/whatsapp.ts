// WhatsApp Business API via a BSP (Interakt-style template send). Configure WA_API_URL, WA_API_KEY, WA_TEMPLATE_NOTICE. Returns false when not configured.
export async function sendWhatsApp(mobile: string, templateName: string, params: string[]): Promise<boolean> {
  if (!process.env.WA_API_URL || !process.env.WA_API_KEY) return false;
  const res = await fetch(process.env.WA_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${process.env.WA_API_KEY}` },
    body: JSON.stringify({ countryCode: '+91', phoneNumber: mobile, type: 'Template', template: { name: templateName, languageCode: 'en', bodyValues: params } }) });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return true;
}
