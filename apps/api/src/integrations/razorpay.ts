// Razorpay payment links + webhook signature check. RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET.
import { createHmac, timingSafeEqual } from 'crypto';
export const razorpayReady = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
export async function createPaymentLink(amountInr: number, desc: string, customer: { name: string; contact: string }, ref: string, notes: Record<string, string>) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/payment_links', { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amountInr * 100), currency: 'INR', description: desc, customer: { name: customer.name, contact: `+91${customer.contact}` }, reference_id: ref, notes, notify: { sms: true } }) });
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ id: string; short_url: string }>;
}
export function verifyWebhook(rawBody: string, signature: string) {
  const expected = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(rawBody).digest('hex');
  try { return timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { return false; }
}
