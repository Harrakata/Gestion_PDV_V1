const day = (value) => (value ? value.split('-').reverse().join('/') : '…');

/** « 2026-11 » → « novembre 2026 ». */
export const monthLabel = (value) => {
  if (!value) return '';
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

/** Rappel court de la période choisie (Tout / Mois / Semaine / Période). */
export const periodFilterLabel = ({ mode, month, week, from, to }) => {
  if (mode === 'mois' && month) return monthLabel(month);
  if (mode === 'semaine' && week) return `Semaine ${week.split('-W')[1]} de ${week.split('-W')[0]}`;
  if (mode === 'periode' && (from || to)) return `${day(from)} → ${day(to)}`;
  return 'Toutes les dates';
};
