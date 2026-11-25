import {
  chefAgenceSupabase,
  chefSecteurSupabase,
  directeurGeneralSupabase,
  exploitationSupabase,
  guichetiereSupabase,
  technicienSupabase,
  validationGainSupabase,
} from '@/lib/supabaseClient';
import { createLiveFeed, LIVE_FEED_DELAYS, watchTables } from '@/lib/liveFeed';
import { resources } from '@/lib/resourceMode';
import { SPACE_SOURCES, tablesOfSpace } from './notificationsModel';
import { createNotificationsRepository } from './notificationsRepository';

// Un seul flux de notifications par espace et par onglet, partagé entre la page de l'espace et
// la surveillance globale. Chaque flux lit avec le client (donc la session) de SON espace, quel
// que soit l'écran affiché.
const SPACE_CLIENTS = {
  'espace-exploitation': exploitationSupabase,
  'espace-chef-agence': chefAgenceSupabase,
  'espace-chef-secteur': chefSecteurSupabase,
  'espace-directeur-regional': validationGainSupabase,
  'espace-directeur-general': directeurGeneralSupabase,
  'espace-guichetiere': guichetiereSupabase,
  'espace-technicien': technicienSupabase,
};

// Délai avant arrêt : une page qui se ferme peut être aussitôt relayée par une autre.
const GRACE_MS = 1000;

const DELAYS = { ...LIVE_FEED_DELAYS, ...resources.feed };

const entries = new Map();

const createEntry = (spaceKey, context) => {
  const client = SPACE_CLIENTS[spaceKey];
  const repository = createNotificationsRepository(client);
  const entry = { context: context || {}, consumers: new Set(), list: null, stopTimer: null };
  entry.feed = createLiveFeed({
    sources: SPACE_SOURCES[spaceKey].map((source) => ({
      ...source,
      load: () => source.load(repository, entry.context),
      concerns: source.concerns && ((row) => source.concerns(row, entry.context)),
    })),
    watch: resources.realtime ? (handlers) => watchTables(client, `notif-${spaceKey}`, tablesOfSpace(spaceKey), handlers) : null,
    delays: DELAYS,
    onChange: ({ values, complete }) => {
      entry.list = [...values.values()].flatMap((list) => list || []);
      entry.consumers.forEach((consumer) => consumer.onList?.(entry.list));
      const [first] = [...entry.consumers].filter((consumer) => consumer.onFreshList);
      first?.onFreshList(spaceKey, entry.context, entry.list, complete);
    },
  });
  return entry;
};

const applyContext = (entry, context) => {
  if (JSON.stringify(context || {}) === JSON.stringify(entry.context)) return;
  entry.context = context || {};
  entry.list = null;
  entry.feed.refresh({ forget: true });
};

/** L'espace a-t-il une session ouverte sur cet appareil ? */
export const hasSpaceSession = async (spaceKey) => {
  try {
    const { data } = await SPACE_CLIENTS[spaceKey].auth.getSession();
    return Boolean(data?.session);
  } catch {
    return false;
  }
};

/**
 * Suit les notifications d'un espace. Le contexte (agence, matricule…) est celui de la page ;
 * la surveillance globale, sans `onList`, se greffe sur le flux en place.
 * @param {object} consumer { onList(list), onFreshList(spaceKey, context, list, complete) }
 * @returns {{ setContext: Function, refresh: Function, freshen: Function, leave: Function }}
 */
export const joinSpaceNotifications = (spaceKey, context, consumer) => {
  if (!SPACE_CLIENTS[spaceKey]) return { setContext() {}, refresh() {}, freshen() {}, leave() {} };
  let entry = entries.get(spaceKey);
  const isNew = !entry;
  if (isNew) {
    entry = createEntry(spaceKey, context);
    entries.set(spaceKey, entry);
  }
  clearTimeout(entry.stopTimer);
  entry.consumers.add(consumer);
  if (isNew) entry.feed.start();
  else if (consumer.onList) {
    applyContext(entry, context);
    if (entry.list) consumer.onList(entry.list);
  }

  return {
    setContext: (next) => applyContext(entry, next),
    refresh: () => entry.feed.refresh(),
    freshen: () => entry.feed.freshen(),
    leave() {
      entry.consumers.delete(consumer);
      clearTimeout(entry.stopTimer);
      if (entry.consumers.size) return;
      entry.stopTimer = setTimeout(() => {
        entry.feed.stop();
        if (entries.get(spaceKey) === entry) entries.delete(spaceKey);
      }, GRACE_MS);
    },
  };
};
