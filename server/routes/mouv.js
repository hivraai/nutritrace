/**
 * mouv.js — what MOUV adds to a member's page.
 *
 *   GET    /api/mouv/today   Whoop read live from HIVRA, plus the GLP-1 answer
 *   PUT    /api/mouv/glp1    Save the GLP-1 answer, with consent
 *   DELETE /api/mouv/glp1    Forget it
 *
 * Whoop passes through and is never written here: its terms forbid a copy, and
 * the AI on this page does not get it. A dose has no field on purpose.
 */
import { Router } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { wrap } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';
import { GLP1_STATUSES, glp1OpenFor } from '../lib/mouv-context.js';

const router = Router();
router.use(requireAuth);

const member = (req) => db.prepare('SELECT * FROM mouv_members WHERE user_id = ?').get(req.user.id);

/** HIVRA checks this the same way this server checks its links. */
function memberToken(m, lang) {
  const body = Buffer.from(JSON.stringify({ sub: m.contact_id, tid: m.tenant_id, lang, exp: Date.now() + 60_000, aud: 'member' })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', process.env.WA_LINK_SECRET).update(body).digest('base64url')}`;
}

async function readWhoop(m, lang) {
  const base = process.env.HIVRA_BASE_URL;
  if (!base || !process.env.WA_LINK_SECRET) return null;
  try {
    const res = await fetch(`${base}/api/nutrition-page/member?t=${encodeURIComponent(memberToken(m, lang))}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json())?.whoop ?? null;
  } catch {
    return null;
  }
}

router.get('/today', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const m = member(req);
  if (!m) return res.json({ member: false, whoop: null, glp1: null });
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  const whoop = await readWhoop(m, lang);
  const open = glp1OpenFor(m.contact_id, process.env.MOUV_GLP1_CONTACT_IDS);
  res.json({ member: true, whoop, glp1: open ? { status: m.glp1_status ?? null } : null });
}));

router.put('/glp1', wrap((req, res) => {
  const m = member(req);
  if (!m || !glp1OpenFor(m.contact_id, process.env.MOUV_GLP1_CONTACT_IDS)) return res.status(403).json({ error: 'Not available' });
  const { status, consent } = req.body || {};
  if (!GLP1_STATUSES.includes(status)) return res.status(400).json({ error: 'Bad status' });
  if (consent !== true) return res.status(400).json({ error: 'Consent required' });
  db.prepare(`UPDATE mouv_members SET glp1_status = ?, glp1_consented_at = datetime('now') WHERE user_id = ?`).run(status, req.user.id);
  res.json({ status });
}));

router.delete('/glp1', wrap((req, res) => {
  db.prepare('UPDATE mouv_members SET glp1_status = NULL, glp1_consented_at = NULL WHERE user_id = ?').run(req.user.id);
  res.json({ status: null });
}));

export default router;
