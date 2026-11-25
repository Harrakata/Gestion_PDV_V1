// Quand envoyer l'état de synchro d'un appareil (module sans dépendance, testé).
//
// L'état est vérifié sur l'appareil toutes les 5 minutes, sans appel réseau. Il n'est envoyé que
// s'il a changé, si une synchro vient d'aboutir, ou pour signaler que l'appareil est toujours vu.
export const SYNC_HEALTH_KEEP_ALIVE_MS = 30 * 60 * 1000;

/** Empreinte de ce qui est enregistré, hors horodatages d'envoi. */
export const syncHealthSignature = ({ last_seen_at: _seen, updated_at: _updated, last_sync_at: _synced, ...state }) => JSON.stringify(state);

/** @param last { signature, at } du dernier envoi réussi, ou null */
export const shouldSendSyncHealth = ({ signature, last, now, justSynced = false, keepAlive = SYNC_HEALTH_KEEP_ALIVE_MS }) => {
  if (justSynced || !last || last.signature !== signature) return true;
  const age = now - last.at;
  return age < 0 || age >= keepAlive;
};
