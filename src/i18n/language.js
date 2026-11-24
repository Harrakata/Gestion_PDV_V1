// ════════════════════════════════════════════════════════════════════════════
//  Langue de l'application.
//
//  Le code est écrit en français ; l'anglais est obtenu à l'affichage (translate.js).
//  La langue est fixée au démarrage : en changer recharge la page.
//  Priorité : choix personnel (Profil, sur cet appareil) → langue du client
//  (Paramètres, en base, copie locale) → VITE_CLIENT_LANGUAGE → français.
// ════════════════════════════════════════════════════════════════════════════

export const LANGUAGES = [
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
];

const USER_KEY = 'app_language_user';
const CLIENT_KEY = 'app_language_client';

const valid = (value) => (LANGUAGES.some((item) => item.value === value) ? value : null);
const read = (key) => { try { return valid(window.localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const DEFAULT_LANGUAGE = valid(import.meta.env?.VITE_CLIENT_LANGUAGE) || 'fr';

/** Langue par défaut du client (copie locale du réglage en base). */
export const getClientLanguage = () => read(CLIENT_KEY) || DEFAULT_LANGUAGE;
/** Choix personnel sur cet appareil, ou null (= langue du client). */
export const getUserLanguage = () => read(USER_KEY);

const effective = () => getUserLanguage() || getClientLanguage();

/** Langue active, figée pour toute la durée de la page. */
export const language = effective();
export const isEnglish = language === 'en';
/** Jours abrégés, du lundi au dimanche. Pas au dictionnaire : « Sam » est aussi un prénom. */
export const WEEKDAYS_SHORT = isEnglish
  ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
/** Format des dates et des nombres. */
export const appLocale = () => (isEnglish ? 'en-GB' : 'fr-FR');

const reloadIfChanged = () => {
  if (effective() === language) return false;
  window.location.reload();
  return true;
};

/** Choix personnel (null = suivre la langue du client). Renvoie true si la page se recharge. */
export const setUserLanguage = (value) => write(USER_KEY, valid(value)) && reloadIfChanged();
/** Copie locale de la langue du client. Renvoie true si la page se recharge. */
export const cacheClientLanguage = (value) => write(CLIENT_KEY, valid(value)) && reloadIfChanged();

if (typeof document !== 'undefined') document.documentElement.lang = language;
