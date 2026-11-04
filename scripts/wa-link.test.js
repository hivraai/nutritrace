import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyWaLink, waLinkUsername } from '../server/lib/wa-link.js';

const SECRET = 'test-secret';
const NOW = 1_800_000_000_000;
const SUB = '11111111-2222-3333-4444-555555555555';
const TID = '047d95b8-ac26-4217-8d05-e49d4964ba8a';

function sign(payload, secret = SECRET) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}
const good = { sub: SUB, tid: TID, lang: 'es', exp: NOW + 1000 };

test('a signed, unexpired link opens', () => {
  assert.deepEqual(verifyWaLink(sign(good), SECRET, NOW), { sub: SUB, tid: TID, lang: 'es', exp: NOW + 1000 });
});
test('another secret, a changed body or no secret does not', () => {
  assert.equal(verifyWaLink(sign(good, 'other'), SECRET, NOW), null);
  const [, mac] = sign(good).split('.');
  const body = Buffer.from(JSON.stringify({ ...good, sub: TID })).toString('base64url');
  assert.equal(verifyWaLink(`${body}.${mac}`, SECRET, NOW), null);
  assert.equal(verifyWaLink(sign(good), '', NOW), null);
});
test('a server-to-server token does not', () => {
  assert.equal(verifyWaLink(sign({ ...good, aud: 'member' }), SECRET, NOW), null);
});
test('an expired link does not', () => {
  assert.equal(verifyWaLink(sign({ ...good, exp: NOW }), SECRET, NOW), null);
});
test('junk does not throw', () => {
  for (const t of [undefined, '', 'a', 'a.b', 'a.b.c', '.', sign({ ...good, sub: '../x' })]) {
    assert.equal(verifyWaLink(t, SECRET, NOW), null);
  }
});
test('the language falls back to Spanish, and en stays en', () => {
  assert.equal(verifyWaLink(sign({ ...good, lang: 'xx' }), SECRET, NOW).lang, 'es');
  assert.equal(verifyWaLink(sign({ ...good, lang: 'en' }), SECRET, NOW).lang, 'en');
});
test('the username holds neither name nor phone and differs by business', () => {
  const a = waLinkUsername({ sub: SUB, tid: TID });
  assert.match(a, /^wa_047d95b8_[0-9a-f]+$/);
  assert.notEqual(a, waLinkUsername({ sub: SUB, tid: '99999999-ac26-4217-8d05-e49d4964ba8a' }));
});
