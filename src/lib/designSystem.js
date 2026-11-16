/**
 * Vocabulaire visuel partagé par les domaines métier.
 *
 * Les alias historiques permettent une migration progressive des écrans qui
 * utilisent encore des noms de couleurs. Le code métier doit préférer les
 * tons sémantiques : success, warning, danger, info, neutral et primary.
 */
export const SEMANTIC_TONES = Object.freeze({
  PRIMARY: 'primary',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
  INFO: 'info',
  NEUTRAL: 'neutral',
});

const TONE_ALIASES = Object.freeze({
  green: SEMANTIC_TONES.SUCCESS,
  emerald: SEMANTIC_TONES.SUCCESS,
  amber: SEMANTIC_TONES.WARNING,
  orange: SEMANTIC_TONES.WARNING,
  red: SEMANTIC_TONES.DANGER,
  destructive: SEMANTIC_TONES.DANGER,
  blue: SEMANTIC_TONES.INFO,
  slate: SEMANTIC_TONES.NEUTRAL,
  gray: SEMANTIC_TONES.NEUTRAL,
  grey: SEMANTIC_TONES.NEUTRAL,
  violet: SEMANTIC_TONES.PRIMARY,
});

export const resolveSemanticTone = (tone, fallback = SEMANTIC_TONES.NEUTRAL) => {
  const normalized = String(tone || '').trim().toLowerCase();
  if (Object.values(SEMANTIC_TONES).includes(normalized)) return normalized;
  return TONE_ALIASES[normalized] || fallback;
};

export const STATUS_TONE_BY_STATE = Object.freeze({
  actif: SEMANTIC_TONES.SUCCESS,
  active: SEMANTIC_TONES.SUCCESS,
  valide: SEMANTIC_TONES.SUCCESS,
  validé: SEMANTIC_TONES.SUCCESS,
  validée: SEMANTIC_TONES.SUCCESS,
  resolu: SEMANTIC_TONES.SUCCESS,
  résolu: SEMANTIC_TONES.SUCCESS,
  termine: SEMANTIC_TONES.SUCCESS,
  terminé: SEMANTIC_TONES.SUCCESS,
  en_cours: SEMANTIC_TONES.INFO,
  'en cours': SEMANTIC_TONES.INFO,
  assigne: SEMANTIC_TONES.INFO,
  assigné: SEMANTIC_TONES.INFO,
  information: SEMANTIC_TONES.INFO,
  attente: SEMANTIC_TONES.WARNING,
  'en attente': SEMANTIC_TONES.WARNING,
  maintenance: SEMANTIC_TONES.WARNING,
  retard: SEMANTIC_TONES.DANGER,
  critique: SEMANTIC_TONES.DANGER,
  refuse: SEMANTIC_TONES.DANGER,
  refusé: SEMANTIC_TONES.DANGER,
  refusée: SEMANTIC_TONES.DANGER,
  annulee: SEMANTIC_TONES.NEUTRAL,
  annulée: SEMANTIC_TONES.NEUTRAL,
  annule: SEMANTIC_TONES.NEUTRAL,
  annulé: SEMANTIC_TONES.NEUTRAL,
  cloture: SEMANTIC_TONES.NEUTRAL,
  clôturé: SEMANTIC_TONES.NEUTRAL,
  inactif: SEMANTIC_TONES.NEUTRAL,
});

export const toneForStatus = (status, fallback = SEMANTIC_TONES.NEUTRAL) => {
  const normalized = String(status || '').trim().toLowerCase();
  return STATUS_TONE_BY_STATE[normalized] || fallback;
};

