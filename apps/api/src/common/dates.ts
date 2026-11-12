/** Last day of a 'YYYY-MM' month as 'YYYY-MM-DD' (28/29/30/31 as the calendar says), for "from m-01 to month end" queries. */
export function monthEnd(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  if (!y || !mo || mo < 1 || mo > 12) return m + '-31'; // not a valid month: leave it to the caller's own validation
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`;
}
