import { OCCASIONS, caption, fill, fitFont, hashtags, initials, wrapLines } from '../../admin/src/lib/postText';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };
const w10 = (s: string) => s.length * 10; // every character is 10 px wide

// every occasion has all three languages, a colour trio and a hashtag
for (const o of OCCASIONS) { for (const l of ['en', 'hi', 'hn'] as const) { if (!o.title[l] || !o.body[l]) { bad++; console.log('FAIL missing text', o.key, l); } } if (o.colours.length !== 3 || !o.colours.every((c) => /^#[0-9A-F]{6}$/i.test(c))) { bad++; console.log('FAIL colours', o.key); } if (!/^[A-Za-z]+$/.test(o.tag)) { bad++; console.log('FAIL tag', o.key); } if (!o.body.en.includes('{centre}') && o.key !== 'custom') { bad++; console.log('FAIL no {centre} in', o.key); } }
eq(new Set(OCCASIONS.map((o) => o.key)).size, OCCASIONS.length, 'unique occasion keys');
eq(/[\u0900-\u097F]/.test(OCCASIONS[0].title.hi) && !/[\u0900-\u097F]/.test(OCCASIONS[0].body.hn), true, 'Hindi in Devanagari, Hinglish in Roman letters');

eq(fill('Best wishes from {centre}. {centre}!', 'Aangan School'), 'Best wishes from Aangan School. Aangan School!', 'fill');
eq([initials('Demo Public School'), initials('St. Xavier’s High School'), initials('Sharma Classes'), initials('आदर्श विद्यालय'), initials('')], ['D', 'SX', 'S', 'आव', 'N'], 'initials');

eq(wrapLines('one two three four five', 100, w10), ['one two', 'three four', 'five'], 'wraps at 10 characters');
eq(wrapLines('a\n\nb', 100, w10), ['a', '', 'b'], 'blank lines kept');
eq(wrapLines('abcdefghijklmnopqrstuvwxyz', 100, w10), ['abcdefghij', 'klmnopqrst', 'uvwxyz'], 'a long word is split');
eq(wrapLines('', 100, w10), [''], 'empty');

const f1 = fitFont('Happy Diwali', 600, 2, 100, 40, (size, s) => s.length * size * 0.5); eq([f1.size, f1.lines, f1.fits], [100, ['Happy Diwali'], true], 'fits at the start size');
const f2 = fitFont('Happy Independence Day to everyone', 600, 2, 100, 40, (size, s) => s.length * size * 0.5); eq(f2.fits && f2.lines.length <= 2 && f2.size < 100 && f2.size >= 40, true, 'shrinks until it fits');
const f3 = fitFont('word '.repeat(200), 300, 3, 40, 30, (size, s) => s.length * size * 0.5); eq([f3.fits, f3.lines.length, f3.size, f3.lines[2].endsWith('…')], [false, 3, 30, true], 'too long: smallest size, cut with …');

const o = OCCASIONS.find((x) => x.key === 'diwali')!;
eq(hashtags(o, 'Demo Public School', 'Ranchi'), ['#HappyDiwali', '#Wishes', '#DemoPublicSchool', '#Ranchi', '#School', '#Students', '#Education'], 'hashtags');
eq(hashtags(OCCASIONS.find((x) => x.key === 'custom')!, 'A', '').includes('#Wishes'), false, 'no #Wishes for a custom message');
const cap = caption({ title: 'Happy Diwali', body: 'Warm wishes.', centre: 'Demo Public School', phone: '9876543210', website: 'demo.school', address: '', city: 'Ranchi', occasion: o });
eq([cap.startsWith('🪔 Happy Diwali'), cap.includes('📞 9876543210'), cap.includes('🌐 demo.school'), cap.includes('📍'), cap.endsWith('#Education')], [true, true, true, false, true], 'caption');
console.log(bad ? `${bad} FAILED` : 'post self-test: all passed'); process.exit(bad ? 1 : 0);
