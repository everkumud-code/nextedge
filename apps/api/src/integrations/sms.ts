// SMS / OTP adapter. Swap providers here only. MSG91 is the default for India.
export async function sendSms(mobile: string, text: string, otp?: string): Promise<void> {
  const provider = process.env.OTP_MODE || 'dev';
  if (provider === 'dev') { console.log(`[sms:dev] to ${mobile}: ${text}`); return; }
  if (provider === 'msg91') {
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY! },
      body: JSON.stringify({ mobile: `91${mobile}`, otp, template_id: process.env.MSG91_TEMPLATE_ID }),
    });
    if (!res.ok) throw new Error(`MSG91 failed: ${res.status} ${await res.text()}`);
    return;
  }
  throw new Error(`Unknown OTP_MODE ${provider}`);
}
