/** Returns a Material Symbols icon name based on keywords in the meal name */
export function mealIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('breakfast') || n.includes('morning') || n.includes('brunch') || n.includes('desayuno')) return 'free_breakfast';
  if (n.includes('lunch') || n.includes('noon') || n.includes('midday') || n.includes('almuerzo')) return 'lunch_dining';
  if (n.includes('dinner') || n.includes('supper') || n.includes('evening') || n.includes('cena')) return 'dinner_dining';
  if (n.includes('snack') || n.includes('bite') || n.includes('treat') || n.includes('merienda')) return 'cookie';
  if (n.includes('drink') || n.includes('smoothie') || n.includes('shake')) return 'local_cafe';
  return 'restaurant';
}
