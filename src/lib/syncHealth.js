import { supabase } from '@/lib/supabaseClient';
import { getQueued } from '@/lib/offlineQueue';
import { isMissingSupabaseTableError } from '@/lib/guichetiereSpace';
import { shouldSendSyncHealth, syncHealthSignature } from '@/lib/syncHealthPolicy';
import { resources } from '@/lib/resourceMode';

// ════════════════════════════════════════════════════════════════════════════
//  Santé de la synchro hors-ligne — télémétrie par appareil.
//
//  La file d'écriture est locale (IndexedDB). Chaque appareil remonte (best-effort)
//  son état de synchro dans la table `sync_health` (1 ligne / appareil, upsert sur
//  device_id), pour donner une visibilité à l'exploitation.
//  Voir supabase/migrations/add_sync_health.sql.
// ════════════════════════════════════════════════════════════════════════════

export const SYNC_HEALTH_TABLE = 'sync_health';
const DEVICE_KEY = 'sync_device_id';
const LAST_SENT_KEY = 'sync_health_sent';

const readLastSent = () => {
  try { return JSON.parse(localStorage.getItem(LAST_SENT_KEY) || 'null'); } catch { return null; }
};
const writeLastSent = (value) => {
  try { localStorage.setItem(LAST_SENT_KEY, JSON.stringify(value)); } catch { /* stockage indisponible */ }
};
const APP_VERSION = import.meta.env.VITE_APP_VERSION || import.meta.env.VITE_CLIENT_ID || null;

/** Identifiant stable de l'appareil (persisté en localStorage). */
export const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'unknown-device';
  }
};

/** Métriques calculées depuis la file locale : en attente, échecs, plus ancien, dernière erreur. */
export const computeQueueMetrics = async () => {
  const items = await getQueued(); // trié par createdAt asc
  const pending = items.length;
  const failed = items.filter((i) => (i.retries || 0) > 0).length;
  const oldest = items.length ? items[0].createdAt : null;
  const lastError = [...items].reverse().map((i) => i.lastError).find(Boolean) || null;
  return {
    pending,
    failed,
    oldestIso: oldest ? new Date(oldest).toISOString() : null,
    lastError,
  };
};

export const isMissingSyncHealthTableError = (error) => isMissingSupabaseTableError(error, SYNC_HEALTH_TABLE);

/**
 * Remonte l'état de synchro de cet appareil (best-effort, jamais bloquant), s'il y a du nouveau
 * (cf. syncHealthPolicy).
 * @param identity { userId, nom, role, agence, region }
 * @param opts     { justSynced } — si vrai, met à jour last_sync_at.
 */
export const reportSyncHealth = async (identity = {}, opts = {}) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const { pending, failed, oldestIso, lastError } = await computeQueueMetrics();
    const now = new Date().toISOString();
    const row = {
      device_id: getDeviceId(),
      user_id: identity.userId != null ? String(identity.userId) : null,
      user_nom: identity.nom || null,
      role: identity.role || null,
      agence_nom: identity.agence || null,
      region: identity.region || null,
      pending_count: pending,
      oldest_pending_at: oldestIso,
      failed_count: failed,
      last_error: lastError,
      last_seen_at: now,
      app_version: APP_VERSION,
      updated_at: now,
    };
    // last_sync_at n'est inclus que si une synchro vient d'aboutir (sinon valeur conservée).
    if (opts.justSynced) row.last_sync_at = now;

    const signature = syncHealthSignature(row);
    if (!shouldSendSyncHealth({ signature, last: readLastSent(), now: Date.now(), justSynced: opts.justSynced, keepAlive: resources.syncHealthKeepAlive })) return;
    const { error } = await supabase.from(SYNC_HEALTH_TABLE).upsert(row, { onConflict: 'device_id' });
    if (!error || isMissingSyncHealthTableError(error)) writeLastSent({ signature, at: Date.now() });
  } catch {
    /* best-effort : jamais bloquant */
  }
};

export const SYNC_STALE_HOURS = 2; // écritures en attente plus vieilles que X h = « bloqué »

/** Lecture du tableau (exploitation). Renvoie [] si la table n'existe pas encore. */
export const fetchSyncHealth = async () => {
  const { data, error } = await supabase
    .from(SYNC_HEALTH_TABLE)
    .select('*')
    .order('last_seen_at', { ascending: false });
  if (error) {
    if (isMissingSyncHealthTableError(error)) return { rows: [], error: null };
    return { rows: [], error };
  }
  return { rows: data || [], error: null };
};
