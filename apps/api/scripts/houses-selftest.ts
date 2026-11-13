import { cleanHouse, distribute, rankHouses } from '../src/houses/houses';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };
const mk = (n: number, gender: string, tag: string, houseId: string | null = null) => Array.from({ length: n }, (_, i) => ({ id: `${tag}${i}`, name: `${tag}-${String(i).padStart(3, '0')}`, gender, houseId }));
const H = ['red', 'blue', 'green', 'yellow'];
const count = (r: { houseId: string }[], h: string) => r.filter((x) => x.houseId === h).length;

// 40 boys + 38 girls over 4 houses: every house gets 10 or 9-10 of each
const all = [...mk(40, 'Male', 'b'), ...mk(38, 'Female', 'g')]; const r = distribute(all, H);
eq(r.length, 78, 'everyone gets a house'); eq(H.map((h) => count(r, h)).sort((a: number, b: number) => a - b), [19, 19, 20, 20], 'sizes differ by at most 1');
const girls = new Set(all.filter((s) => s.gender === 'Female').map((s) => s.id)); eq(H.map((h) => r.filter((x) => x.houseId === h && girls.has(x.studentId)).length).sort((a: number, b: number) => a - b), [9, 9, 10, 10], 'girls spread evenly');
eq(JSON.stringify(distribute(all, H)) === JSON.stringify(r), true, 'same answer every time');
// students who already have a house stay put and are counted
const part = [...mk(8, 'Male', 'x', 'red'), ...mk(8, 'Male', 'n')]; const r2 = distribute(part, H);
eq([r2.length, r2.some((x) => x.studentId.startsWith('x'))], [8, false], 'only the unassigned are moved'); eq(count(r2, 'red'), 0, 'the full house gets none of the 8 boys (the others have 0, 0, 0)');
eq(H.map((h) => count(r2, h)), [0, 3, 3, 2], 'new boys fill the empty houses first');
eq(distribute(all, []), [], 'no houses, nothing to do');
eq(distribute([{ id: 'z', name: 'Z', gender: 'Male', houseId: 'deleted-house' }], H).length, 1, 'a student pointing at a deleted house is treated as unassigned');
// ranks
eq(rankHouses([{ id: 'a', points: 10 }, { id: 'b', points: 30 }, { id: 'c', points: 30 }, { id: 'd', points: 5 }]).map((h) => [h.id, h.rank]), [['b', 1], ['c', 1], ['a', 3], ['d', 4]], 'ranks share ties');
eq(rankHouses([{ id: 'a', points: -5 }, { id: 'b', points: 0 }]).map((h) => h.rank), [1, 2], 'negative points rank last');
// house form
eq((cleanHouse({ name: '  ' }) as any).error, 'Enter the house name.', 'name needed'); eq((cleanHouse({ name: ' Ashoka ', colour: 'red', motto: ' Valour ' }) as any).ok, { name: 'Ashoka', colour: '#C62828', motto: 'Valour' }, 'bad colour falls back'); eq((cleanHouse({ name: 'A', colour: '#112233' }) as any).ok.colour, '#112233', 'good colour kept');
console.log(bad ? `${bad} FAILED` : 'houses self-test: all passed'); process.exit(bad ? 1 : 0);
