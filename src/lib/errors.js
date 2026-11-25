// ════════════════════════════════════════════════════════════════════════════
//  Gestion centralisée des erreurs
//
//  Objectif : qu'aucune erreur ne passe inaperçue, et que l'utilisateur ne voie
//  jamais un message technique (« violates foreign key constraint… »).
//
//  - describeError(error, where, fallback) : signale l'erreur (Sentry + journal
//    local) et renvoie un message compréhensible. À utiliser dans les toasts :
//        toast({ title: 'Erreur', description: describeError(error, 'AgencesPage'), variant: 'destructive' })
//  - reportError(error, context) : signale sans rien afficher (erreurs silencieuses
//    qu'on veut tout de même tracer, ex. dans un catch de synchro).
//  - toUserMessage(error, fallback) : traduction seule, sans signalement.
//
//  Débogage sur appareil (les console.* sont supprimés en production) :
//  les 30 dernières erreurs sont gardées en sessionStorage et lisibles depuis la
//  console du navigateur avec  window.__gpdvErrors()
// ════════════════════════════════════════════════════════════════════════════

import { captureError } from '@/lib/monitoring';

const JOURNAL_KEY = 'gpdv_error_journal';
const JOURNAL_SIZE = 30;
const GENERIC_MESSAGE = "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez l'exploitation.";

// Codes PostgreSQL / PostgREST les plus fréquents → message utilisateur.
const CODE_MESSAGES = {
  '23505': 'Cet enregistrement existe déjà (valeur en double).',
  '23503': "Opération impossible : cet élément est lié à d'autres données.",
  '23502': 'Un champ obligatoire est manquant.',
  '23514': "Une valeur saisie n'est pas autorisée.",
  '22P02': "Une valeur saisie n'a pas le bon format.",
  '22001': 'Une valeur saisie est trop longue.',
  '42501': "Vous n'avez pas les droits nécessaires pour cette action.",
  PGRST116: 'Élément introuvable : il a peut-être été supprimé ou modifié.',
  PGRST301: 'Votre session a expiré. Veuillez vous reconnecter.',
};

// Motifs de message (erreurs réseau, auth, stockage…) → message utilisateur.
const PATTERN_MESSAGES = [
  [/failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected/i,
    'Connexion impossible. Vérifiez votre réseau puis réessayez.'],
  [/timeout|timed out|aborted/i, 'Le serveur met trop de temps à répondre. Réessayez dans un instant.'],
  [/jwt expired|invalid jwt|refresh token/i, 'Votre session a expiré. Veuillez vous reconnecter.'],
  [/invalid login credentials/i, 'Identifiants incorrects.'],
  [/row-level security|permission denied|not authorized|unauthorized/i,
    "Vous n'avez pas les droits nécessaires pour cette action."],
  [/duplicate key/i, CODE_MESSAGES['23505']],
  [/foreign key/i, CODE_MESSAGES['23503']],
  [/payload too large|entity too large|exceeded the maximum allowed size/i, 'Le fichier est trop volumineux.'],
  [/quota/i, "L'espace de stockage de l'appareil est plein."],
];

const messageOf = (error) => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.error_description || error.error || '');
};

// Vocabulaire des messages techniques (Supabase / PostgreSQL / JavaScript, en anglais).
const TECHNICAL_RE = /\b(the|of|is|are|not|could|cannot|can't|does|violates|column|relation|function|null|undefined|object|requested|rows?|returned|input|syntax|constraint|exception|error|failed|unexpected|token|schema|key|value|type)\b|[{}[\]<>]|=>|::/i;

/** Vrai si le message est déjà destiné à l'utilisateur (erreurs levées par l'app, en français). */
const looksUserFacing = (msg) => msg.length > 0 && msg.length <= 200 && !TECHNICAL_RE.test(msg);

/** Traduit une erreur en message compréhensible (sans la signaler). */
export const toUserMessage = (error, fallback) => {
  const code = error && typeof error === 'object' ? String(error.code || '') : '';
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  const msg = messageOf(error);
  for (const [re, text] of PATTERN_MESSAGES) if (re.test(msg)) return text;
  if (looksUserFacing(msg)) return msg;
  return fallback || GENERIC_MESSAGE;
};

const pushJournal = (entry) => {
  try {
    const list = JSON.parse(window.sessionStorage.getItem(JOURNAL_KEY) || '[]');
    list.unshift(entry);
    window.sessionStorage.setItem(JOURNAL_KEY, JSON.stringify(list.slice(0, JOURNAL_SIZE)));
  } catch { /* stockage indisponible : le signalement Sentry reste fait */ }
};

/** Lecture du journal local (console du navigateur : window.__gpdvErrors()). */
export const readErrorJournal = () => {
  try { return JSON.parse(window.sessionStorage.getItem(JOURNAL_KEY) || '[]'); } catch { return []; }
};
if (typeof window !== 'undefined') window.__gpdvErrors = readErrorJournal;

/** Signale une erreur (Sentry + journal local) sans rien afficher. */
export const reportError = (error, context = {}) => {
  if (!error) return;
  const err = error instanceof Error ? error : Object.assign(new Error(messageOf(error) || 'Erreur'), { cause: error });
  const details = {
    ...context,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    path: typeof window !== 'undefined' ? window.location.pathname : undefined,
  };
  captureError(err, details);
  pushJournal({ at: new Date().toISOString(), message: messageOf(error), ...details });
  if (import.meta.env.DEV) {
     
    console.error(`[${context.where || 'erreur'}]`, error);
  }
};

/**
 * Signale l'erreur et renvoie un message prêt pour un toast.
 * @param {unknown} error
 * @param {string}  where     origine (nom du composant / de l'action) pour le diagnostic.
 * @param {string}  fallback  message à afficher si l'erreur n'est pas reconnue.
 */
export const describeError = (error, where, fallback) => {
  reportError(error, { where });
  return toUserMessage(error, fallback);
};
