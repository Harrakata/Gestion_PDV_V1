// Conservation des journaux d'activité (connexions et navigations). La suppression est faite par
// la base, chaque nuit (migration 202611251200_purge_journaux_activite.sql).
export const RETENTION_SETTING_KEY = 'activity_retention';
export const PURGE_STATUS_SETTING_KEY = 'activity_purge_status';

export const KEEP_ALL = 'all';
export const MIN_RETENTION_DAYS = 30; // plancher appliqué aussi par la base
export const RETENTION_OPTIONS = [
  { value: KEEP_ALL, label: 'Tout' },
  { value: '30', label: '30 jours' },
  { value: '90', label: '90 jours' },
  { value: '365', label: '1 an' },
];

/** Durée conservée en jours, ou null si tout est conservé (comme activity_retention_days en base). */
export const retentionDays = (setting) => {
  const raw = String(setting?.days ?? '');
  return /^\d{1,5}$/.test(raw) ? Math.max(Number(raw), MIN_RETENTION_DAYS) : null;
};

export const toOption = (days) => (days === null ? KEEP_ALL : String(days));
export const fromOption = (option) => (option === KEEP_ALL ? null : Number(option));

/** Ce choix supprimera-t-il des lignes conservées jusqu'ici ? */
export const deletesMore = (nextDays, currentDays) => nextDays !== null && (currentDays === null || nextDays < currentDays);

/** Date avant laquelle les lignes sont supprimées. */
export const cutoffOf = (days, now = Date.now()) => new Date(now - days * 24 * 3600 * 1000).toISOString();
