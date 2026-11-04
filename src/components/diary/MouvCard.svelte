<script>
  /**
   * Diary → MOUV card: today's Whoop, read live and never saved, and the GLP-1
   * answer. Shows nothing for an account that did not come from the WhatsApp
   * button, and nothing for a part that is switched off.
   */
  import { onMount } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import { apiUrl } from '../../lib/platform.js';

  let whoop = null;
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
  .mc-error { font-size: 12px; color: var(--danger); margin: 0; }
</style>
