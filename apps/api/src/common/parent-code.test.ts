import test from 'node:test';
import assert from 'node:assert/strict';
import { PARENT_CODE_FAIL_LIMIT, checkParentCode, cleanMobile, issueParentCode, parentCodeMessage, type KV } from './parent-code';

function memory(): KV & { dump(): Map<string, string> } {
  const m = new Map<string, string>();
  return {
    async get(k) { return m.get(k) ?? null; },
    async set(k, v) { m.set(k, v); },
    async del(k) { m.delete(k); },
    async hit(k) { const n = Number(m.get(k) ?? 0) + 1; m.set(k, String(n)); return n; },
    dump: () => m,
  };
}

test('a code works once, for that parent only', async () => {
  const kv = memory();
  const code = await issueParentCode(kv, 'centre1', '9876543210');
  assert.match(code, /^\d{6}$/);
  assert.equal(await checkParentCode(kv, 'centre1', '9876543210', code), 'ok');
  assert.equal(await checkParentCode(kv, 'centre1', '9876543210', code), 'expired');
});

test('the code is not stored in plain, and another number or school cannot use it', async () => {
  const kv = memory();
  const code = await issueParentCode(kv, 'centre1', '9876543210');
  assert.ok([...kv.dump().values()].every(v => !v.includes(code)));
  assert.equal(await checkParentCode(kv, 'centre1', '9876543211', code), 'expired');
  assert.equal(await checkParentCode(kv, 'centre2', '9876543210', code), 'expired');
  assert.equal(await checkParentCode(kv, 'centre1', '9876543210', code), 'ok');
});

test('a new code replaces the old one', async () => {
  const kv = memory();
  const first = await issueParentCode(kv, 'c', '9000000001');
  let second = await issueParentCode(kv, 'c', '9000000001');
  while (second === first) second = await issueParentCode(kv, 'c', '9000000001');
  assert.equal(await checkParentCode(kv, 'c', '9000000001', first), 'wrong');
  assert.equal(await checkParentCode(kv, 'c', '9000000001', second), 'ok');
});

test('five wrong tries lock the code, even the right one then fails', async () => {
  const kv = memory();
  const code = await issueParentCode(kv, 'c', '9000000002');
  const wrong = code === '000000' ? '111111' : '000000';
  const results: string[] = [];
  for (let i = 0; i < PARENT_CODE_FAIL_LIMIT; i++) results.push(await checkParentCode(kv, 'c', '9000000002', wrong));
  assert.deepEqual(results, ['wrong', 'wrong', 'wrong', 'wrong', 'locked']);
  assert.equal(await checkParentCode(kv, 'c', '9000000002', code), 'expired');
});

test('only six digits are accepted, mobiles are cleaned, and the message carries the details', async () => {
  const kv = memory();
  await issueParentCode(kv, 'c', '9000000003');
  assert.equal(await checkParentCode(kv, 'c', '9000000003', 'abcdef'), 'wrong');
  assert.equal(await checkParentCode(kv, 'c', '9000000003', '12345'), 'wrong');
  assert.equal(cleanMobile('+91 98765-43210'), '9876543210');
  const text = parentCodeMessage('Sunrise School', 'https://sunrise.nextsoftwares.in', '9876543210', '123456');
  assert.ok(text.includes('Sunrise School') && text.includes('123456') && text.includes('9876543210') && text.includes('sunrise.nextsoftwares.in'));
});
