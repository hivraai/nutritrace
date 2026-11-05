/**
 * mouv.js — what MOUV adds to a member's page.
 *
 *   GET    /api/mouv/today   Whoop read live from HIVRA, classes attended, the GLP-1 answer
 *   PUT    /api/mouv/glp1    Save the GLP-1 answer, with consent
 *   DELETE /api/mouv/glp1    Forget it
 *   PUT    /api/mouv/weight  The weight that sizes class calories
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
import { logClasses, memberWeightKg, reestimateClasses, validWeightKg } from '../lib/mouv-classes.js';

const router = Router();
router.use(requireAuth);

const member = (req) => db.prepare('SELECT * FROM mouv_members WHERE user_id = ?').get(req.user.id);

/** HIVRA checks this the same way this server checks its links. */
function memberToken(m, lang) {
  const body = Buffer.from(JSON.stringify({ sub: m.contact_id, tid: m.tenant_id, lang, exp: Date.now() + 60_000, aud: 'member' })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', process.env.WA_LINK_SECRET).update(body).digest('base64url')}`;
}

async function readHivra(m, lang, wantClasses) {
  const base = process.env.HIVRA_BASE_URL;
  if (!base || !process.env.WA_LINK_SECRET) return null;
  try {
    const res = await fetch(`${base}/api/nutrition-page/member?t=${encodeURIComponent(memberToken(m, lang))}${wantClasses ? '&classes=1' : ''}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

router.get('/today', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const m = member(req);
  if (!m) return res.json({ member: false, whoop: null, glp1: null });
  const lang = req.query.lang === 'en' ? 'en' : 'es';
  // Each class read is a MindBody call, so at most one every 20 minutes per member.
  const wantClasses = !!db.prepare(`SELECT 1 FROM mouv_members WHERE user_id = ? AND (classes_synced_at IS NULL OR classes_synced_at < datetime('now', '-20 minutes'))`).get(req.user.id);
  const hivra = await readHivra(m, lang, wantClasses);
  const weightKg = memberWeightKg(db, req.user.id, m.weight_kg);
  let classesLogged = 0;
  if (Array.isArray(hivra?.classes)) {
    classesLogged = logClasses(db, req.user.id, hivra.classes, weightKg);
    db.prepare(`UPDATE mouv_members SET classes_synced_at = datetime('now') WHERE user_id = ?`).run(req.user.id);
  }
  const hasClass = !!db.prepare('SELECT 1 FROM mouv_class_log WHERE user_id = ? LIMIT 1').get(req.user.id);
  const open = glp1OpenFor(m.contact_id, process.env.MOUV_GLP1_CONTACT_IDS);
  res.json({ member: true, whoop: hivra?.whoop ?? null, glp1: open ? { status: m.glp1_status ?? null } : null, classesLogged, needsWeight: hasClass && !weightKg });
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

router.put('/weight', wrap((req, res) => {
  const m = member(req);
  const kg = validWeightKg(req.body?.kg);
  if (!m) return res.status(403).json({ error: 'Not available' });
  if (!kg) return res.status(400).json({ error: 'Bad weight' });
  db.prepare('UPDATE mouv_members SET weight_kg = ? WHERE user_id = ?').run(kg, req.user.id);
  res.json({ updated: reestimateClasses(db, req.user.id, kg) });
}));

export default router;
