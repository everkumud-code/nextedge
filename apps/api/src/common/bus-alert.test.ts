import test from 'node:test';
import assert from 'node:assert/strict';
import { busAlertText, isAlertKind } from './bus-alert';

test('a late bus says how late, a breakdown says what to expect', () => {
  assert.equal(busAlertText({ kind: 'late', route: 'Route 3', minutes: 15 }).title, 'Route 3: running about 15 minutes late');
  assert.equal(busAlertText({ kind: 'late', route: 'Route 3' }).title, 'Route 3: running late');
  assert.match(busAlertText({ kind: 'breakdown', route: 'Route 3', vehicle: 'JH01AB1234' }).body, /JH01AB1234/);
  assert.equal(busAlertText({ kind: 'arrived', route: 'Route 3' }).title, 'Route 3: bus has reached the school');
});

test('the driver note and number are added, long input is cut, rubbish minutes are ignored', () => {
  const a = busAlertText({ kind: 'late', route: 'R', minutes: 9999, note: '  Heavy   traffic at the bridge ', contact: '9876543210' });
  assert.equal(a.title, 'R: running late');
  assert.equal(a.body, 'Heavy traffic at the bridge · Driver: 9876543210');
  assert.ok(busAlertText({ kind: 'other', route: 'R', note: 'x'.repeat(1000) }).body.length <= 240);
});

test('only the known kinds are accepted', () => {
  assert.equal(isAlertKind('late'), true);
  assert.equal(isAlertKind('fire'), false);
  assert.equal(isAlertKind(undefined), false);
});
