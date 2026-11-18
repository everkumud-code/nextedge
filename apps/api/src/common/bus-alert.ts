/** Bus alerts: what the driver (or the office) can tell the parents of a route with one tap. */
export const BUS_ALERT_KINDS = ['late', 'breakdown', 'route_changed', 'arrived', 'other'] as const;
export type BusAlertKind = (typeof BUS_ALERT_KINDS)[number];

export type AlertInput = { kind: BusAlertKind; route: string; vehicle?: string | null; minutes?: number | null; note?: string | null; contact?: string | null };

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Title and body of the notice and the push message. */
export function busAlertText(a: AlertInput): { title: string; body: string } {
  const route = clean(a.route, 60) || 'School bus'; const note = clean(a.note, 240); const veh = clean(a.vehicle, 30);
  const mins = Number(a.minutes); const m = Number.isFinite(mins) && mins > 0 && mins <= 240 ? Math.round(mins) : 0;
  const tail = [note, a.contact ? `Driver: ${clean(a.contact, 20)}` : ''].filter(Boolean).join(' · ');
  switch (a.kind) {
    case 'late': return { title: `${route}: running ${m ? `about ${m} minutes ` : ''}late`, body: tail || `The bus${veh ? ` (${veh})` : ''} is running late. Sorry for the wait.` };
    case 'breakdown': return { title: `${route}: bus has broken down`, body: tail || `The bus${veh ? ` (${veh})` : ''} has stopped because of a problem. The school will tell you about the next steps.` };
    case 'route_changed': return { title: `${route}: route changed today`, body: tail || 'The bus is taking a different route today. Pickup times may change.' };
    case 'arrived': return { title: `${route}: bus has reached the school`, body: tail || 'The bus has reached the school safely.' };
    default: return { title: `${route}: message from the bus`, body: note || 'Please check with the school.' };
  }
}

export const isAlertKind = (v: unknown): v is BusAlertKind => (BUS_ALERT_KINDS as readonly string[]).includes(String(v));
