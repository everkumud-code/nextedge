// Zoom Server-to-Server OAuth: the centre pastes Account ID / Client ID / Client Secret from marketplace.zoom.us → the API creates meetings automatically.
export async function zoomCreateMeeting(cfg: { accountId: string; clientId: string; clientSecret: string }, topic: string, startAt: Date, durationMin: number) {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const tok = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${cfg.accountId}`, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  if (!tok.ok) throw new Error(`Zoom auth failed: ${tok.status}`);
  const { access_token } = (await tok.json()) as any;
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, type: 2, start_time: startAt.toISOString(), duration: durationMin, timezone: 'Asia/Kolkata', settings: { join_before_host: false, waiting_room: false, mute_upon_entry: true, auto_recording: 'cloud' } }) });
  if (!res.ok) throw new Error(`Zoom create failed: ${res.status} ${await res.text()}`);
  const m = (await res.json()) as any; return { joinUrl: m.join_url as string, startUrl: m.start_url as string, meetingId: String(m.id) };
}
