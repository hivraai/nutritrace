<script>
  /**
   * Diary → MOUV card: today's Whoop, read live and never saved, the GLP-1 answer,
   * and for a member on treatment protein and training in place of a calorie goal.
   * Shows nothing for an account that did not come from the WhatsApp button, and
   * nothing for a part that is switched off.
   */
  import { onMount } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import { apiUrl } from '../../lib/platform.js';
  import { NtApi } from '../../lib/api.js';
  import { currentDate } from '../../stores/diary.js';
  import { dayActivity, loadActivity } from '../../stores/activity.js';
  import { weightUnit } from '../../stores/settings.js';
  import { mouvGlp1Focus } from '../../stores/mouv.js';

  export let proteinToday = 0;

  // The 2025 joint advisory on nutrition during GLP-1 treatment (ACLM, ASN, OMA, TOS).
  const PROTEIN_RANGE = '80–120';
  const STRENGTH_TARGET = 3;
  const CARDIO_TARGET_MIN = 150;
  const STRENGTH = /reformer|fuerza|strength|pesas|weights/i;
  const KG_PER_LB = 0.45359237;

  let whoop = null;
  let needsWeight = false;
  let weightInput = '';
  let weightFailed = false;
  let strengthDone = 0;
  let cardioMin = 0;
  let glp1 = null;
  let editing = false;
  let choice = '';
  let consent = false;
  let saving = false;
  let failed = false;

  const OPTIONS = ['no', 'starting', 'steady', 'stopped', 'private'];
  const langParam = () => (String($locale || '').startsWith('en') ? 'en' : 'es');

  function headers() {
    const h = { 'Content-Type': 'application/json' };
    const csrf = localStorage.getItem('nt:csrf');
    if (csrf) h['X-CSRF-Token'] = csrf;
    return h;
  }

  onMount(async () => {
    try {
      const res = await fetch(apiUrl(`/api/mouv/today?lang=${langParam()}`), { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      whoop = data.whoop;
      glp1 = data.glp1;
      editing = glp1 !== null && !glp1.status;
      needsWeight = data.needsWeight === true;
      if (data.classesLogged > 0) await loadActivity($currentDate);
    } catch {
      // The diary works without this card.
    }
  });

  async function save() {
    saving = true;
    failed = false;
    try {
      const res = await fetch(apiUrl('/api/mouv/glp1'), { method: 'PUT', credentials: 'include', headers: headers(), body: JSON.stringify({ status: choice, consent }) });
      if (!res.ok) throw new Error('save');
      glp1 = { status: choice };
      editing = false;
    } catch {
      failed = true;
    } finally {
      saving = false;
    }
  }

  async function forget() {
    saving = true;
    failed = false;
    try {
      const res = await fetch(apiUrl('/api/mouv/glp1'), { method: 'DELETE', credentials: 'include', headers: headers() });
      if (!res.ok) throw new Error('forget');
      glp1 = { status: null };
      choice = '';
      consent = false;
      editing = true;
    } catch {
      failed = true;
    } finally {
      saving = false;
    }
  }

  async function saveWeight() {
    const n = Number(weightInput);
    const kg = $weightUnit === 'lb' ? n * KG_PER_LB : n;
    saving = true;
    weightFailed = false;
    try {
      const res = await fetch(apiUrl('/api/mouv/weight'), { method: 'PUT', credentials: 'include', headers: headers(), body: JSON.stringify({ kg }) });
      if (!res.ok) throw new Error('weight');
      needsWeight = false;
      await loadActivity($currentDate);
    } catch {
      weightFailed = true;
    } finally {
      saving = false;
    }
  }

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  async function loadWeek() {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    try {
      const rows = await NtApi.getActivityRange(iso(monday), iso(sunday));
      const list = Array.isArray(rows) ? rows : [];
      strengthDone = list.filter((r) => STRENGTH.test(r.name || '')).length;
      cardioMin = list.filter((r) => !STRENGTH.test(r.name || '')).reduce((sum, r) => sum + (Number(r.duration_min) || 0), 0);
    } catch {
      // The rows keep their last numbers.
    }
  }

  $: onTreatment = glp1?.status === 'starting' || glp1?.status === 'steady';
  $: mouvGlp1Focus.set(onTreatment);
  $: if (onTreatment && $dayActivity) loadWeek();

  $: bands = whoop?.connected ? [['recovery', whoop.recovery], ['sleep', whoop.sleep], ['strain', whoop.strain]] : [];
</script>

{#if whoop?.enabled}
  <section class="card mouv-card">
    <h2 class="mc-title">Whoop</h2>
    {#if whoop.connected}
      <div class="mc-bands">
        {#each bands as [name, band]}
          <div class="mc-band">
            <span class="mc-label">{$_(`mouv.whoop.${name}`)}</span>
            <span class="mc-value">{band ? $_(`mouv.whoop.band_${band}`) : '—'}</span>
          </div>
        {/each}
      </div>
    {:else if whoop.connectUrl}
      <p class="mc-text">{$_('mouv.whoop.connect_text')}</p>
      <a class="btn btn-primary mc-action" href={whoop.connectUrl}>{$_('mouv.whoop.connect')}</a>
    {/if}
  </section>
{/if}

{#if onTreatment}
  <section class="card mouv-card">
    <h2 class="mc-title">{$_('mouv.focus.title')}</h2>
    <div class="mc-bands">
      <div class="mc-band">
        <span class="mc-label">{$_('mouv.focus.protein')}</span>
        <span class="mc-value">{Math.round(proteinToday)} g</span>
        <span class="mc-note">{$_('mouv.focus.protein_goal', { values: { range: PROTEIN_RANGE } })}</span>
      </div>
      <div class="mc-band">
        <span class="mc-label">{$_('mouv.focus.strength')}</span>
        <span class="mc-value">{strengthDone} / {STRENGTH_TARGET}</span>
        <span class="mc-note">{$_('mouv.focus.this_week')}</span>
      </div>
      <div class="mc-band">
        <span class="mc-label">{$_('mouv.focus.cardio')}</span>
        <span class="mc-value">{cardioMin} / {CARDIO_TARGET_MIN}</span>
        <span class="mc-note">{$_('mouv.focus.minutes_week')}</span>
      </div>
    </div>
    <p class="mc-note">{$_('mouv.focus.tips')}</p>
    {#if glp1.status === 'starting'}<p class="mc-note">{$_('mouv.focus.starting')}</p>{/if}
  </section>
{:else if needsWeight}
  <section class="card mouv-card">
    <h2 class="mc-title">{$_('mouv.classes.weight_title')}</h2>
    <p class="mc-text">{$_('mouv.classes.weight_text')}</p>
    <div class="mc-weight">
      <input class="input" type="number" inputmode="decimal" min="30" max="660" bind:value={weightInput} aria-label={$_('mouv.classes.weight_title')} />
      <span class="mc-label">{$weightUnit === 'lb' ? 'lb' : 'kg'}</span>
      <button class="btn btn-primary" disabled={!weightInput || saving} on:click={saveWeight}>{$_('mouv.glp1.save')}</button>
    </div>
    {#if weightFailed}<p class="mc-error">{$_('mouv.glp1.failed')}</p>{/if}
  </section>
{/if}

{#if glp1}
  <section class="card mouv-card">
    <h2 class="mc-title">{$_('mouv.glp1.title')}</h2>
    {#if editing}
      <p class="mc-text">{$_('mouv.glp1.question')}</p>
      <div class="mc-options">
        {#each OPTIONS as option}
          <label class="mc-option">
            <input type="radio" name="mouv-glp1" value={option} bind:group={choice} />
            <span>{$_(`mouv.glp1.status_${option}`)}</span>
          </label>
        {/each}
      </div>
      <label class="mc-option mc-consent">
        <input type="checkbox" bind:checked={consent} />
        <span>{$_('mouv.glp1.consent')}</span>
      </label>
      <button class="btn btn-primary mc-action" disabled={!choice || !consent || saving} on:click={save}>{$_('mouv.glp1.save')}</button>
    {:else}
      <p class="mc-text">{$_(`mouv.glp1.status_${glp1.status}`)}</p>
      <p class="mc-note">{$_('mouv.glp1.note')}</p>
      <button class="mc-link" disabled={saving} on:click={forget}>{$_('mouv.glp1.forget')}</button>
    {/if}
    {#if failed}<p class="mc-error">{$_('mouv.glp1.failed')}</p>{/if}
  </section>
{/if}

<style>
  .mouv-card { padding: 16px; margin: 0 var(--page-px) 12px; display: flex; flex-direction: column; gap: 10px; }
  .mc-title { font-size: 15px; font-weight: 700; margin: 0; }
  .mc-text { font-size: 14px; color: var(--text-2); margin: 0; }
  .mc-note { font-size: 12px; color: var(--text-3); margin: 0; }
  .mc-bands { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .mc-band { display: flex; flex-direction: column; gap: 2px; }
  .mc-label { font-size: 12px; color: var(--text-3); }
  .mc-value { font-size: 15px; font-weight: 600; color: var(--accent); }
  .mc-options { display: flex; flex-direction: column; gap: 8px; }
  .mc-option { display: flex; align-items: flex-start; gap: 8px; font-size: 14px; color: var(--text-1); }
  .mc-consent { font-size: 12px; color: var(--text-2); }
  .mc-action { align-self: flex-start; text-decoration: none; }
  .mc-link { align-self: flex-start; font-size: 12px; color: var(--text-3); text-decoration: underline; }
  .mc-weight { display: flex; align-items: center; gap: 8px; }
  .mc-weight input { width: 90px; }
  .mc-error { font-size: 12px; color: var(--danger); margin: 0; }
</style>
