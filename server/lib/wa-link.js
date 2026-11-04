/**
 * The link a member taps in the MOUV WhatsApp chat. HIVRA signs it with the
 * shared WA_LINK_SECRET; here it is only checked. Pure: no database, no clock
 * of its own, so scripts/wa-link.test.js can run it without installing anything.
 *
 * Token: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of that string).
 * Payload: { sub: contact id, tid: tenant id, lang: "es" | "en", exp: ms }.
 */
import crypto from 'crypto';

const ID = /^[0-9a-f-]{8,64}$/i;

/** The checked payload, or null. Never says why, to a caller or in a log. */
export function verifyWaLink(token, secret, nowMs) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const want = crypto.createHmac('sha256', secret).update(parts[0]).digest();
  const got = Buffer.from(parts[1], 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || !ID.test(String(payload.sub)) || !ID.test(String(payload.tid))) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= nowMs) return null;
  // A server-to-server token (mouv.js) is not a way in.
  if (payload.aud) return null;
  return { sub: String(payload.sub), tid: String(payload.tid), lang: payload.lang === 'en' ? 'en' : 'es', exp: payload.exp };
}

/** One account per member per business, never a name or a phone number. */
export function waLinkUsername(link) {
  return `wa_${link.tid.replace(/-/g, '').slice(0, 8)}_${link.sub.replace(/-/g, '')}`.toLowerCase();
}
