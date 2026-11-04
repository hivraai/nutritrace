import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glp1OpenFor, mouvContextBlock, withMouvContext } from '../server/lib/mouv-context.js';

test('Honduran food is always there, and the client prompt is kept first', () => {
  const out = withMouvContext('client prompt', null);
  assert.ok(out.startsWith('client prompt\n\n'));
  assert.match(out, /baleada/);
  assert.match(withMouvContext(undefined, null), /^MOUV/);
});

test('a member on treatment gets no calorie target, others do not get the line', () => {
  for (const s of ['starting', 'steady']) assert.match(mouvContextBlock(s), /give no calorie target/);
  for (const s of ['no', 'stopped', 'private', null, undefined, 'junk']) {
    assert.doesNotMatch(mouvContextBlock(s), /give no calorie target/);
  }
  assert.match(mouvContextBlock('starting'), /lighter training/);
  assert.doesNotMatch(mouvContextBlock('steady'), /lighter training/);
});

test('the rule against selling or dosing is on every member', () => {
  for (const s of [null, 'no', 'steady']) assert.match(mouvContextBlock(s), /never sell, promote, recommend/);
});

test('GLP-1 opens only for listed contacts', () => {
  assert.equal(glp1OpenFor('ABC-1', ' abc-1 , def '), true);
  assert.equal(glp1OpenFor('xyz', 'abc-1,def'), false);
  assert.equal(glp1OpenFor('abc-1', ''), false);
  assert.equal(glp1OpenFor('abc-1', undefined), false);
  assert.equal(glp1OpenFor(null, 'abc-1'), false);
});
