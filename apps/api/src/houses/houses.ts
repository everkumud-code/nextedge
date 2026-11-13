/** House system rules (pure functions, no database, so they can be self-tested). */
export type HStudent = { id: string; name: string; gender?: string | null; houseId?: string | null };

export const HOUSE_COLOURS = ['#C62828', '#1565C0', '#2E7D32', '#F9A825', '#6A1B9A', '#EF6C00', '#00838F', '#AD1457'];
export const ROLE_SUGGESTIONS = ['House Captain', 'Vice Captain', 'Sports Captain', 'Cultural Captain', 'Prefect', 'Discipline Captain'];

const g = (s: HStudent) => (s.gender === 'Female' ? 'F' : s.gender === 'Male' ? 'M' : 'O');

/**
 * Share the students who have no house equally between the houses, boys and girls separately, so every house gets a similar mix.
 * Students who already have a house are not moved (their counts are respected). Same input always gives the same answer.
 */
export function distribute(students: HStudent[], houseIds: string[]): { studentId: string; houseId: string }[] {
  if (!houseIds.length) return [];
  const total = new Map(houseIds.map((h) => [h, 0])); const by = new Map(houseIds.map((h) => [h, { M: 0, F: 0, O: 0 } as Record<string, number>]));
  for (const s of students) if (s.houseId && total.has(s.houseId)) { total.set(s.houseId, total.get(s.houseId)! + 1); by.get(s.houseId)![g(s)]++; }
  const todo = students.filter((s) => !s.houseId || !total.has(s.houseId)).sort((a, b) => g(a).localeCompare(g(b)) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const out: { studentId: string; houseId: string }[] = [];
  for (const s of todo) {
    let best = houseIds[0];
    for (const h of houseIds) { const a = by.get(h)![g(s)], b = by.get(best)![g(s)]; if (a < b || (a === b && total.get(h)! < total.get(best)!)) best = h; }
    by.get(best)![g(s)]++; total.set(best, total.get(best)! + 1); out.push({ studentId: s.id, houseId: best });
  }
  return out;
}

/** Rank by points, highest first; equal points share a rank (1, 2, 2, 4). */
export function rankHouses<T extends { id: string; points: number }>(houses: T[]): (T & { rank: number })[] {
  const sorted = [...houses].sort((a, b) => b.points - a.points); return sorted.map((h) => ({ ...h, rank: sorted.findIndex((x) => x.points === h.points) + 1 }));
}

export function cleanHouse(b: any): { error: string } | { ok: { name: string; colour: string; motto: string } } {
  const name = String(b?.name ?? '').trim().slice(0, 40); if (!name) return { error: 'Enter the house name.' };
  const colour = /^#[0-9a-fA-F]{6}$/.test(String(b?.colour ?? '')) ? String(b.colour) : HOUSE_COLOURS[0];
  return { ok: { name, colour, motto: String(b?.motto ?? '').trim().slice(0, 100) } };
}
