/**
 * MOUV classes in a member's diary: estimated, once each, and never counted toward
 * the daily calorie goal.
 *
 * Calories are (MET - 1) x kg x hours: the day's budget already holds what the
 * body burns at rest. The METs are starting values for MOUV's coaches to adjust:
 * Pilates and Reformer from the 2026 Systematic Reviews pooled estimate (the 2024
 * Compendium has no Reformer entry), the rest from the Compendium's closest entry.
 */

const CLASS_METS = [
  [/reformer/, 3.0],
  [/box/, 7.0],
  [/boot ?camp/, 6.0],
  [/sculpt|burner/, 5.0],
  [/barre/, 3.5],
  [/pilates|core|longevity/, 3.0],
];
const DEFAULT_MET = 3.5;
const DEFAULT_WEIGHT_KG = 70;
const KG_PER_LB = 0.45359237;

const normal = (name) => String(name || '').toLowerCase();

export function classMet(name) {
  const n = normal(name);
  return CLASS_METS.find(([re]) => re.test(n))?.[1] ?? DEFAULT_MET;
}

export function classKcal(met, weightKg, durationMin) {
  return Math.max(0, Math.round((met - 1) * weightKg * (durationMin / 60)));
}

export function validWeightKg(kg) {
  const n = Number(kg);
  return Number.isFinite(n) && n >= 30 && n <= 300 ? n : null;
}

/** The newest weight the member gave: their diary first, then the card's question. */
export function memberWeightKg(db, userId, savedKg) {
  const rows = db.prepare(`SELECT body_stats FROM diary WHERE user_id = ? AND body_stats LIKE '%"weight"%' ORDER BY date DESC LIMIT 10`).all(userId);
  for (const row of rows) {
    try {
      const stats = JSON.parse(row.body_stats);
      const kg = validWeightKg(stats.weight_unit === 'lb' ? Number(stats.weight) * KG_PER_LB : stats.weight);
      if (kg) return kg;
    } catch {}
  }
  return validWeightKg(savedKg);
}

/**
 * Logs what is new and returns how many. A visit logged once never comes back,
 * so a class the member deleted stays deleted. met stays empty on the row because
 * the Add Activity sheet would recompute it with its own formula.
 */
export function logClasses(db, userId, classes, weightKg) {
  const remember = db.prepare('INSERT OR IGNORE INTO mouv_class_log (user_id, visit_id, met, duration_min) VALUES (?, ?, ?, ?)');
  const add = db.prepare(`INSERT INTO activity_log (user_id, date, name, kcal, duration_min, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'mouv_class', datetime('now'), datetime('now'))`);
  const link = db.prepare('UPDATE mouv_class_log SET activity_id = ?, auto_kcal = ? WHERE user_id = ? AND visit_id = ?');
  const run = db.transaction((list) => {
    let logged = 0;
    for (const c of list) {
      const visitId = Number(c?.visitId);
      const minutes = Number(c?.durationMin);
      const name = String(c?.name || '').trim().slice(0, 80);
      if (!Number.isInteger(visitId) || !name || !/^\d{4}-\d{2}-\d{2}$/.test(String(c?.date)) || !(minutes > 0 && minutes <= 240)) continue;
      const met = classMet(name);
      if (remember.run(userId, visitId, met, minutes).changes === 0) continue;
      const kcal = classKcal(met, weightKg ?? DEFAULT_WEIGHT_KG, minutes);
      const row = add.run(userId, c.date, name, kcal, minutes);
      link.run(row.lastInsertRowid, kcal, userId, visitId);
      logged++;
    }
    return logged;
  });
  return run(Array.isArray(classes) ? classes : []);
}

/** A new weight re-estimates the member's classes, except any they edited by hand. */
export function reestimateClasses(db, userId, weightKg) {
  const rows = db.prepare(`SELECT l.visit_id, l.activity_id, l.met, l.duration_min FROM mouv_class_log l
    JOIN activity_log a ON a.id = l.activity_id AND a.user_id = l.user_id
    WHERE l.user_id = ? AND a.deleted_at IS NULL AND a.kcal = l.auto_kcal`).all(userId);
  const setRow = db.prepare(`UPDATE activity_log SET kcal = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`);
  const setLog = db.prepare('UPDATE mouv_class_log SET auto_kcal = ? WHERE user_id = ? AND visit_id = ?');
  db.transaction(() => {
    for (const r of rows) {
      const kcal = classKcal(r.met, weightKg, r.duration_min);
      setRow.run(kcal, r.activity_id, userId);
      setLog.run(kcal, userId, r.visit_id);
    }
  })();
  return rows.length;
}
