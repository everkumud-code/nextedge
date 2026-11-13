import { RESERVED, hostToSlug, slugError, slugify, suggestSlug } from '../src/workspaces/workspaces';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };

eq([slugify('Demo Public School'), slugify('  St. Xavier’s High School!! '), slugify('Sharma & Sons Classes'), slugify('आदर्श विद्यालय'), slugify('Café Étoile Academy')], ['demo-public-school', 'st-xavier-s-high-school', 'sharma-and-sons-classes', '', 'cafe-etoile-academy'], 'slugify');
eq(slugify('a'.repeat(60)).length, 30, 'slugify cuts at 30');
eq(slugify('x'.repeat(29) + ' y').endsWith('-'), false, 'no trailing hyphen after cutting');

eq([slugError('irongym'), slugError('a1-b2'), slugError('ab'), slugError('a'.repeat(31)), slugError('Iron'), slugError('-iron'), slugError('iron-'), slugError('iro--n'), slugError('12345'), slugError('www'), slugError('nextedge'), slugError('my_gym'), slugError('iron.gym')].map((e) => e === null ? 'ok' : 'err'), ['ok', 'ok', 'err', 'err', 'err', 'err', 'err', 'err', 'err', 'err', 'err', 'err', 'err'], 'slugError');
eq([...RESERVED].every((r) => slugError(r) !== null || r.length < 3), true, 'every reserved name is refused');

const taken = new Set(['demo-public-school', 'demo-public-school-2']);
eq(suggestSlug('Demo Public School', taken), 'demo-public-school-3', 'next free number');
eq(suggestSlug('Aangan Academy', taken), 'aangan-academy', 'free name as it is');
eq(suggestSlug('www', new Set()), 'www-co', 'a reserved name gets a suffix');
eq(slugError(suggestSlug('आदर्श विद्यालय', new Set())), null, 'a name with no latin letters still gets a valid address');
eq(slugError(suggestSlug('Ab', new Set())), null, 'a very short name still gets a valid address');
const long = 'x'.repeat(30); eq(suggestSlug(long, new Set([long])).length <= 30 && slugError(suggestSlug(long, new Set([long]))) === null, true, 'a taken 30-letter address is shortened to fit the number');

const B = 'nextsoftwares.in';
eq([hostToSlug('irongym.nextsoftwares.in', B), hostToSlug('IronGym.NextSoftwares.in:443', B), hostToSlug('www.nextsoftwares.in', B), hostToSlug('nextsoftwares.in', B), hostToSlug('a.b.nextsoftwares.in', B), hostToSlug('irongym.nextfit.in', B), hostToSlug('evilnextsoftwares.in', B), hostToSlug('irongym.nextsoftwares.in.', B), hostToSlug('', B), hostToSlug('fit.nextsoftwares.in', B)], ['irongym', 'irongym', null, null, null, null, null, 'irongym', null, null], 'host to slug');
console.log(bad ? `${bad} FAILED` : 'workspaces self-test: all passed'); process.exit(bad ? 1 : 0);
