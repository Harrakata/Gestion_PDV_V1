import { useEffect, useRef } from 'react';
import { getCurrentSupabaseClient } from '@/lib/supabaseClient';
import { createLiveFeed, LIVE_FEED_DELAYS, watchTables } from '@/lib/liveFeed';
import { resources } from '@/lib/resourceMode';

// Une action écrit souvent plusieurs lignes à la suite : on relit une fois l'ensemble arrivé.
const PAGE_DELAYS = { ...LIVE_FEED_DELAYS, ...resources.feed, debounce: 2500 };

/**
 * Charge les données d'un écran puis les tient à jour : temps réel, sinon lecture espacée
 * (cf. lib/liveFeed). Remplace `useEffect(() => { load(); setInterval(load, …) })`.
 *
 * @param {string} name     nom de l'écran
 * @param {Array}  sources  [{ key, load({ first }), tables?, minInterval?, afterSync? }]
 * @param {object} options  { enabled, resetKey } — tout est rechargé quand resetKey change
 */
export function useLiveRefresh(name, sources, { enabled = true, resetKey = null } = {}) {
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  useEffect(() => {
    if (!enabled) return undefined;
    const client = getCurrentSupabaseClient(); // celui de l'écran, aussi pour la fermeture
    const initial = sourcesRef.current;
    const feed = createLiveFeed({
      sources: initial.map((source) => ({
        ...source,
        load: (options) => sourcesRef.current.find(({ key }) => key === source.key).load(options),
      })),
      watch: resources.realtime
        ? (handlers) => watchTables(client, name, [...new Set(initial.flatMap(({ tables }) => tables || []))], handlers)
        : null,
      delays: PAGE_DELAYS,
    });
    feed.start();
    return () => feed.stop();
  }, [name, enabled, resetKey]);
}

export default useLiveRefresh;
