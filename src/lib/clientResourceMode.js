import { loadAppSetting, saveAppSetting } from '@/lib/appSettings';
import { RESOURCE_MODE_SETTING_KEY, cacheClientResourceMode, isResourceModeOutdated } from '@/lib/resourceMode';

/** Aligne cet appareil sur le mode choisi dans Paramètres (best-effort, au démarrage). */
export const syncClientResourceMode = async () => {
  try {
    const value = await loadAppSetting(RESOURCE_MODE_SETTING_KEY);
    cacheClientResourceMode(value?.mode);
    if (isResourceModeOutdated()) window.location.reload();
  } catch {
    /* hors-ligne : la copie locale suffit */
  }
};

/** Enregistre le mode pour tous les utilisateurs. */
export const saveClientResourceMode = async (mode) => {
  await saveAppSetting(RESOURCE_MODE_SETTING_KEY, { mode });
  cacheClientResourceMode(mode);
};
