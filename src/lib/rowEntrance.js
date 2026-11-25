// Apparition des lignes d'une liste (framer-motion). Le retard de chaque ligne est plafonné, et
// les lignes hors de l'écran ne sont pas animées : une liste de 1 000 lignes s'affiche aussi
// vite qu'une liste de 10. Module sans dépendance (testé par tests/unit/rowEntrance.test.js).

export const MAX_ROW_DELAY = 0.3; // secondes
export const ANIMATED_ROWS = 30;

/** Retard de la ligne, plafonné. */
export const rowDelay = (index, step = 0.03) => Math.min(index * step, MAX_ROW_DELAY);

/**
 * Propriétés d'une ligne `motion.*` : `<motion.tr {...rowEntrance(index, { y: 12 })}>`.
 * @param from { x?, y?, step? } décalage de départ (px) et retard entre deux lignes (s)
 */
export const rowEntrance = (index, { x = 0, y = 0, step } = {}) => ({
  initial: index < ANIMATED_ROWS ? { opacity: 0, x, y } : false,
  animate: { opacity: 1, x: 0, y: 0 },
  transition: { delay: rowDelay(index, step) },
});
