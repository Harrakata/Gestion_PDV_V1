import { useEffect, useRef } from 'react';
import { reportSyncHealth } from '@/lib/syncHealth';

const CHECK_MS = 5 * 60 * 1000; // vérification locale ; n'envoie que s'il y a du nouveau
const START_DELAY_MS = 3000; // laisse l'identité se compléter : un seul envoi au démarrage

/**
 * Remonte l'état de synchro de l'appareil (best-effort) : au démarrage, après chaque synchro
 * ayant envoyé des écritures (event 'offline-queue-synced'), et dès que l'état local change
 * (vérifié toutes les 5 min). À monter dans les espaces qui écrivent hors-ligne.
 *
 * @param identity { userId, nom, role, agence, region }
 * @param enabled  n'émet que si vrai (ex. authentifié && mode hors-ligne actif)
 */
export function useSyncHealthHeartbeat(identity, enabled = true) {
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const identityKey = JSON.stringify(identity || {});

  useEffect(() => {
    if (!enabled) return undefined;
    const beat = (opts) => { reportSyncHealth(identityRef.current, opts); };

    const startTimer = setTimeout(() => beat(), START_DELAY_MS);
    // L'évènement est émis aussi quand la file était vide ou n'a rien pu envoyer.
    const onSynced = (event) => beat({ justSynced: Boolean(event.detail?.synced) });
    window.addEventListener('offline-queue-synced', onSynced);
    const interval = setInterval(() => beat(), CHECK_MS);

    return () => {
      clearTimeout(startTimer);
      window.removeEventListener('offline-queue-synced', onSynced);
      clearInterval(interval);
    };
     
  }, [enabled, identityKey]);
}

export default useSyncHealthHeartbeat;
