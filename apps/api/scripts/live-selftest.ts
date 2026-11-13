import { linkMessage, pickToNotify } from '../src/live/live.service';
let bad = 0; const eq = (a: any, b: any, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', m, '→', JSON.stringify(a), 'expected', JSON.stringify(b)); } };
const kids = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
eq(pickToNotify(kids, []).map((k) => k.id), ['a', 'b', 'c'], 'everyone absent gets the link the first time');
eq(pickToNotify(kids, ['a', 'c']).map((k) => k.id), ['b'], 'only the child who has not got it yet');
eq(pickToNotify(kids, ['a', 'b', 'c']), [], 'nobody twice');
eq(pickToNotify([], ['a']), [], 'nobody absent');
const m = linkMessage('Aarav', 'Maths Class 8-A'); eq([m.title, m.body.includes('Aarav'), m.body.includes('not in class')], ['Maths Class 8-A is live now — join from home', true, true], 'message');
console.log(bad ? `${bad} FAILED` : 'live self-test: all passed'); process.exit(bad ? 1 : 0);
