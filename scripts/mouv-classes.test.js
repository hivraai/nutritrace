/**
 * MOUV classes in the diary: estimated, once each, and out of the calorie goal.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { classKcal, classMet, validWeightKg } from '../server/lib/mouv-classes.js';

let db = null, classes = null, sum = null, dir = null;
try {
  createRequire(new URL('../server/package.json', import.meta.url))('better-sqlite3');
  dir = mkdtempSync(join(tmpdir(), 'nt-mouv-classes-'));
  process.env.DB_PATH = join(dir, 'test.db');
  db = (await import('../server/db.js')).default;
  classes = await import('../server/lib/mouv-classes.js');
  sum = (await import('../server/lib/active-calories.js')).sumManualActivity;
} catch { /* better-sqlite3 not built for this Node: the database tests skip */ }
test.after(() => { try { db?.close(); } catch {} if (dir) rmSync(dir, { recursive: true, force: true }); });

test('real MOUV class names get the right intensity', () => {
  assert.equal(classMet('Mouv Reformer Flow'), 3);
  assert.equal(classMet('Full Body Burner Reformer'), 3);
  assert.equal(classMet('Mouv Reformer Bounce and Burn (Jumping Board)'), 3);
  assert.equal(classMet('Mouv Boxing'), 7);
  assert.equal(classMet('Mouv Boot Camp'), 6);
  assert.equal(classMet('Mouv Sculpt Hit Me Up'), 5);
  assert.equal(classMet('Mouv Barre 360'), 3.5);
  assert.equal(classMet('Mouv Pilates on Mat'), 3);
  assert.equal(classMet('Something new'), 3.5);
});

test('the estimate leaves out what the body burns at rest', () => {
  assert.equal(classKcal(3, 70, 45), 105);
  assert.equal(validWeightKg(10), null);
  assert.equal(validWeightKg(70), 70);
});

const skip = () => !db && 'better-sqlite3 not built';
const user = (id) => db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')`).run(id, `u${id}@test`);
const reformer = { visitId: 501, name: 'Mouv Reformer Flow', date: '2026-11-02', durationMin: 45 };

test('a class logs once, stays deleted, and stays with its member', { skip: skip() }, () => {
  user(1); user(2);
  assert.equal(classes.logClasses(db, 1, [reformer], 70), 1);
  assert.equal(classes.logClasses(db, 1, [reformer], 70), 0);
  const row = db.prepare(`SELECT * FROM activity_log WHERE user_id = 1`).get();
  assert.equal(row.kcal, 105);
  assert.equal(row.source, 'mouv_class');
  assert.equal(row.met, null);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM activity_log WHERE user_id = 2`).get().c, 0);

  db.prepare(`UPDATE activity_log SET deleted_at = datetime('now') WHERE id = ?`).run(row.id);
  assert.equal(classes.logClasses(db, 1, [reformer], 70), 0);
  // The same visit id on another account is that account's own row.
  assert.equal(classes.logClasses(db, 2, [reformer], 80), 1);
});

test('class calories never raise the goal, a hand-logged workout still counts', { skip: skip() }, () => {
  user(3);
  classes.logClasses(db, 3, [reformer], 70);
  assert.equal(sum(3, '2026-11-02'), 0);
  db.prepare(`INSERT INTO activity_log (user_id, date, name, kcal, source) VALUES (3, '2026-11-02', 'Run', 200, 'manual_form')`).run();
  assert.equal(sum(3, '2026-11-02'), 200);
});

test('a new weight re-estimates, but not a class the member edited', { skip: skip() }, () => {
  user(4);
  classes.logClasses(db, 4, [reformer, { ...reformer, visitId: 502 }], null);
  const [a, b] = db.prepare(`SELECT id, kcal FROM activity_log WHERE user_id = 4 ORDER BY id`).all();
  assert.equal(a.kcal, 105);
  db.prepare(`UPDATE activity_log SET kcal = 300 WHERE id = ?`).run(b.id);
  assert.equal(classes.reestimateClasses(db, 4, 100), 1);
  assert.equal(db.prepare(`SELECT kcal FROM activity_log WHERE id = ?`).get(a.id).kcal, 150);
  assert.equal(db.prepare(`SELECT kcal FROM activity_log WHERE id = ?`).get(b.id).kcal, 300);
});

test('the newest diary weight wins, and pounds convert', { skip: skip() }, () => {
  user(5);
  assert.equal(classes.memberWeightKg(db, 5, 60), 60);
  db.prepare(`INSERT INTO diary (user_id, date, items, body_stats) VALUES (5, '2026-11-01', '[]', ?)`).run(JSON.stringify({ weight: 220, weight_unit: 'lb' }));
  assert.equal(Math.round(classes.memberWeightKg(db, 5, 60)), 100);
});
