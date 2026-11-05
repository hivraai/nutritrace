import { writable } from 'svelte/store';

// True for a member on GLP-1 treatment: the diary shows protein and training
// instead of a calorie goal. Set by the MOUV card from /api/mouv/today.
export const mouvGlp1Focus = writable(false);
