import { loadAppSetting, saveAppSetting } from '@/lib/appSettings';
import { cacheClientLanguage } from '@/i18n/language';

export const LANGUAGE_SETTING_KEY = 'app_language';

/** Aligne cet appareil sur la langue choisie dans Paramètres (best-effort, au démarrage). */
export const syncClientLanguage = async () => {
  try {
    const value = await loadAppSetting(LANGUAGE_SETTING_KEY);
    if (value?.language) cacheClientLanguage(value.language);
  } catch {
    /* hors-ligne : la copie locale suffit */
  }
};

/** Enregistre la langue du client pour tous. Renvoie true si la page se recharge. */
export const saveClientLanguage = async (language) => {
  await saveAppSetting(LANGUAGE_SETTING_KEY, { language });
  return cacheClientLanguage(language);
};
