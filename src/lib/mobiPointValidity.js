const datePart = (value) => String(value || '').slice(0, 10);
const sameKey = (first, second) => first && second
  && String(first).trim().toLocaleLowerCase('fr') === String(second).trim().toLocaleLowerCase('fr');

export const mobiToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export const isValidMobiDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const previousMobiDay = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const mobiPeriodsOverlap = (first, second) => {
  const firstStart = datePart(first.dateDebutValidite) || '0000-01-01';
  const secondStart = datePart(second.dateDebutValidite) || '0000-01-01';
  const firstEnd = datePart(first.dateFinValidite) || '9999-12-31';
  const secondEnd = datePart(second.dateFinValidite) || '9999-12-31';
  return firstStart <= secondEnd && secondStart <= firstEnd;
};

const overlapRange = (first, second) => {
  const start = [datePart(first.dateDebutValidite) || '0000-01-01', datePart(second.dateDebutValidite) || '0000-01-01'].sort().at(-1);
  const end = [datePart(first.dateFinValidite) || '9999-12-31', datePart(second.dateFinValidite) || '9999-12-31'].sort()[0];
  return start <= end ? { start, end } : null;
};

export const isMobiPointCurrent = (point, today) => point.statut === 'Actif'
  && (!point.dateDebutValidite || datePart(point.dateDebutValidite) <= today)
  && (!point.dateFinValidite || datePart(point.dateFinValidite) >= today);

export const mobiPointDisplayStatus = (point, today) => {
  if (point.statut !== 'Actif') return point.statut;
  if (point.dateDebutValidite && datePart(point.dateDebutValidite) > today) return 'Planifié';
  if (point.dateFinValidite && datePart(point.dateFinValidite) < today) return 'Expiré';
  return 'Actif';
};

export const findMobiValidityConflict = (candidate, points, ignoredId, baseline = null) => points.find((point) => {
  if (point.id === ignoredId || !mobiPeriodsOverlap(candidate, point)) return false;
  const sharedKeys = ['pointVenteUid', 'codePointVente', 'terminalReference', 'guichetiereMatricule']
    .filter((key) => sameKey(candidate[key], point[key]));
  if (!sharedKeys.length) return false;
  const baselineShared = baseline && sharedKeys.every((key) => sameKey(baseline[key], point[key]));
  const oldOverlap = baselineShared && overlapRange(baseline, point);
  const newOverlap = overlapRange(candidate, point);
  return !oldOverlap || newOverlap.start < oldOverlap.start || newOverlap.end > oldOverlap.end;
});
