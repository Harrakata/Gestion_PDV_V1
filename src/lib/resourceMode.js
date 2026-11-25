// ════════════════════════════════════════════════════════════════════════════
//  Mode de consommation des ressources Supabase : Dev, Démo ou Prod.
//
//  Un mode ne change aucune règle métier ni aucun droit : seulement la fréquence des appels
//  automatiques et le poids des photos. Il est fixé au démarrage (comme la langue).
//  Priorité : choix sur cet appareil → VITE_RESOURCE_MODE (imposé au déploiement) → choix du
//  client (Paramètres, en base, copie locale) → Dev sur le serveur de développement, sinon Démo.
//
//  Module sans dépendance (testé par tests/unit/resourceMode.test.js).
//  Description complète : docs/MODES-RESSOURCES.md.
// ════════════════════════════════════════════════════════════════════════════

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const NEVER = Infinity;

export const RESOURCE_PROFILES = {
  // Strict minimum : rien ne part sans une action, hors lectures de sécurité très espacées.
  dev: {
    realtime: false,
    feed: { live: NEVER, liveHidden: NEVER, fallback: 30 * MINUTE, fallbackHidden: NEVER, freshness: MINUTE },
    blockedDevices: HOUR,
    presence: 15 * MINUTE,
    presenceWhenHidden: false,
    navigation: { log: false, groupFor: 0 },
    syncHealthKeepAlive: NEVER,
    photo: { maxSide: 1024, quality: 0.6 },
    strictMode: false, // le mode strict de React double chaque lecture du serveur de développement
  },
  // Fonctionnement complet, tenu dans l'abonnement gratuit.
  demo: {
    realtime: true,
    feed: { live: 15 * MINUTE, liveHidden: HOUR, fallback: 3 * MINUTE, fallbackHidden: 15 * MINUTE, freshness: MINUTE },
    blockedDevices: 30 * MINUTE,
    presence: 5 * MINUTE,
    presenceWhenHidden: false,
    navigation: { log: true, groupFor: MINUTE },
    syncHealthKeepAlive: 2 * HOUR,
    photo: { maxSide: 1280, quality: 0.72 },
    strictMode: true,
  },
  // Réactivité maximale, pour un abonnement payant.
  prod: {
    realtime: true,
    feed: { live: 5 * MINUTE, liveHidden: 15 * MINUTE, fallback: MINUTE, fallbackHidden: 5 * MINUTE, freshness: MINUTE },
    blockedDevices: 15 * MINUTE,
    presence: 2 * MINUTE,
    presenceWhenHidden: true,
    navigation: { log: true, groupFor: 0 },
    syncHealthKeepAlive: 30 * MINUTE,
    photo: { maxSide: 1600, quality: 0.82 },
    strictMode: true,
  },
};

export const RESOURCE_MODES = [
  { value: 'dev', label: 'Dev' },
  { value: 'demo', label: 'Démo' },
  { value: 'prod', label: 'Prod' },
];

export const RESOURCE_MODE_SETTING_KEY = 'resource_mode';
const DEVICE_KEY = 'resource_mode_device';
const CLIENT_KEY = 'resource_mode_client';

const valid = (value) => (Object.hasOwn(RESOURCE_PROFILES, String(value)) ? value : null);
const read = (key) => { try { return valid(window.localStorage.getItem(key)); } catch { return null; } };
const write = (key, value) => {
  try {
    if (valid(value)) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key);
  } catch { /* stockage indisponible */ }
};

/** Choix effectif selon la priorité ci-dessus. */
export const resolveResourceMode = ({ device, imposed, client, isDevServer }) => (
  valid(device) || valid(imposed) || valid(client) || (isDevServer ? 'dev' : 'demo')
);

/** Mode imposé par le déploiement, ou null. */
export const imposedResourceMode = valid(import.meta.env?.VITE_RESOURCE_MODE);
/** Choix sur cet appareil, ou null. */
export const getDeviceResourceMode = () => read(DEVICE_KEY);

const resolve = (device) => resolveResourceMode({
  device,
  imposed: imposedResourceMode,
  client: read(CLIENT_KEY),
  isDevServer: Boolean(import.meta.env?.DEV),
});
/** Mode de tous les utilisateurs, hors choix de cet appareil. */
export const getSharedResourceMode = () => resolve(null);

/** Mode actif, figé pour toute la durée de la page. */
export const resourceMode = resolve(getDeviceResourceMode());
export const resources = RESOURCE_PROFILES[resourceMode];

/** Choix sur cet appareil (null = comme tous les utilisateurs), appliqué au prochain chargement. */
export const setDeviceResourceMode = (value) => write(DEVICE_KEY, value);
/** Copie locale du choix du client, appliquée au prochain chargement. */
export const cacheClientResourceMode = (value) => write(CLIENT_KEY, value);
/** Le prochain chargement changera-t-il de mode ? */
export const isResourceModeOutdated = () => resolve(getDeviceResourceMode()) !== resourceMode;

/**
 * Seuils de présence : une personne reste « En ligne » tant que son signal n'est pas en retard.
 * @returns {{ online: number, idle: number }} en millisecondes
 */
export const presenceThresholds = (profile = resources) => ({
  online: profile.presence + MINUTE,
  idle: Math.max(15 * MINUTE, 3 * profile.presence),
});
