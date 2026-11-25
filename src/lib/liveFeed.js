// ════════════════════════════════════════════════════════════════════════════
//  Actualisation économe de données vivantes.
//
//  Remplace les « setInterval(charger, 15 s) » : chaque source est relue quand une de ses
//  tables change (temps réel Supabase), et sinon à intervalle de sécurité. Sans temps réel
//  confirmé, l'intervalle est plus court. Écran masqué : espacé. Hors-ligne : aucun appel.
//
//  Module sans dépendance (testé par tests/unit/liveFeed.test.js).
// ════════════════════════════════════════════════════════════════════════════

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const LIVE_FEED_DELAYS = {
  live: 5 * MINUTE, // temps réel confirmé
  liveHidden: 15 * MINUTE,
  fallback: MINUTE, // temps réel indisponible
  fallbackHidden: 5 * MINUTE,
  freshness: MINUTE, // âge maximal après un retour à l'écran, au réseau ou au temps réel
  glance: 10 * SECOND, // âge maximal quand l'utilisateur consulte les données, sans temps réel
  debounce: 800, // regroupe une rafale de changements
};

const browserEnv = {
  now: () => Date.now(),
  isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  listen: ({ onVisibility, onOnline, onSynced }) => {
    if (typeof window === 'undefined') return () => {};
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    const onQueueSynced = (event) => { if (event.detail?.synced) onSynced(); }; // émis aussi file vide
    window.addEventListener('offline-queue-synced', onQueueSynced);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline-queue-synced', onQueueSynced);
    };
  },
};

/**
 * @param {Array} sources  [{ key, load({ first }), tables?, minInterval?, afterSync? }]
 *   - load        : renvoie la valeur ; s'il échoue, la valeur précédente est conservée.
 *   - tables      : tables dont un changement relit la source.
 *   - concerns    : (ligne modifiée) → false si ce changement ne regarde pas l'utilisateur.
 *   - minInterval : jamais relue plus souvent par l'intervalle de sécurité.
 *   - afterSync   : relue après l'envoi des écritures hors-ligne.
 * @param {Function} watch    ({ onChange(table, ligne), onLive(bool) }) → arrêt (cf. watchTables)
 * @param {Function} onChange ({ values: Map, complete }) après chaque lecture ; `complete` :
 *   toutes les sources ont été lues au moins une fois avec succès.
 */
export const createLiveFeed = ({ sources, watch = null, onChange = () => {}, env = browserEnv, delays = LIVE_FEED_DELAYS }) => {
  const byKey = new Map(sources.map((source) => [source.key, source]));
  const allKeys = [...byKey.keys()];
  const states = new Map();
  const reset = () => allKeys.forEach((key) => states.set(key, { value: undefined, loaded: false, at: -Infinity, expedite: false }));

  let started = false;
  let live = false;
  let generation = 0;
  let running = null;
  let timer = null;
  let debounceTimer = null;
  let unwatch = null;
  let unlisten = null;
  const touched = new Set(); // changées en temps réel, en attente de regroupement
  const queued = new Set(); // demandées pendant une lecture

  reset();

  const baseDelay = () => {
    if (live) return env.isVisible() ? delays.live : delays.liveHidden;
    return env.isVisible() ? delays.fallback : delays.fallbackHidden;
  };
  const dueAt = (key) => {
    const { at, expedite } = states.get(key);
    if (at === -Infinity) return at;
    return at + Math.max(expedite ? delays.freshness : baseDelay(), byKey.get(key).minInterval || 0);
  };

  const schedule = () => {
    clearTimeout(timer);
    if (!started || !allKeys.length || !env.isOnline()) return;
    const next = Math.min(...allKeys.map(dueAt)) - env.now();
    if (Number.isFinite(next)) timer = setTimeout(tick, Math.max(next, 250));
  };

  const loadSource = async (key, current) => {
    const state = states.get(key);
    state.at = env.now();
    state.expedite = false;
    try {
      const value = await byKey.get(key).load({ first: !state.loaded });
      if (current === generation) { state.value = value; state.loaded = true; }
    } catch {
      // La valeur précédente est conservée ; nouvel essai rapproché.
      if (current === generation) state.expedite = true;
    }
  };

  const run = (keys) => {
    if (!started || !keys.length) return Promise.resolve();
    if (running) {
      keys.forEach((key) => queued.add(key));
      return running;
    }
    clearTimeout(timer);
    const current = generation;
    running = Promise.all(keys.map((key) => loadSource(key, current))).then(() => {
      running = null;
      if (!started) return undefined;
      if (current === generation) {
        onChange({
          values: new Map(allKeys.map((key) => [key, states.get(key).value])),
          complete: allKeys.every((key) => states.get(key).loaded),
        });
      }
      const next = [...queued];
      queued.clear();
      if (next.length) return run(next);
      schedule();
      return undefined;
    });
    return running;
  };

  function tick() {
    if (!started || !env.isOnline()) return;
    const due = allKeys.filter((key) => dueAt(key) <= env.now());
    if (due.length) run(due); else schedule();
  }

  const expedite = (keys) => keys.forEach((key) => { states.get(key).expedite = true; });

  const onTable = (table, row = null) => {
    sources
      .filter((source) => source.tables?.includes(table) && (!row || !source.concerns || source.concerns(row)))
      .forEach((source) => touched.add(source.key));
    if (!touched.size) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const keys = [...touched];
      touched.clear();
      run(keys);
    }, delays.debounce);
  };

  // Écoute (re)établie : un changement a pu passer inaperçu entre-temps.
  const onLive = (value) => {
    if (live === value) return;
    live = value;
    if (live) expedite(sources.filter((source) => source.tables?.length).map((source) => source.key));
    tick();
  };

  // Retour à l'écran : rien à relire si le temps réel a tenu les données à jour.
  const onVisibility = () => {
    if (env.isVisible() && !live) expedite(allKeys);
    if (!running) tick();
  };
  const onOnline = () => { expedite(allKeys); if (!running) tick(); };
  const onSynced = () => run(sources.filter((source) => source.afterSync).map((source) => source.key));

  return {
    start() {
      if (started) return;
      started = true;
      unlisten = env.listen({ onVisibility, onOnline, onSynced });
      run(allKeys);
      unwatch = watch?.({ onChange: onTable, onLive }) || null;
    },
    /** Relit ce qui n'est pas à jour, quand l'utilisateur consulte les données (cloche ouverte). */
    freshen() {
      if (live || running || !env.isOnline()) return;
      run(allKeys.filter((key) => env.now() - states.get(key).at >= delays.glance));
    },
    /** Relit tout, par exemple après un changement de contexte (`forget` : valeurs oubliées). */
    refresh({ forget = false } = {}) {
      if (forget) { generation += 1; reset(); }
      return run(allKeys);
    },
    stop() {
      started = false;
      live = false;
      generation += 1;
      clearTimeout(timer);
      clearTimeout(debounceTimer);
      touched.clear();
      queued.clear();
      unlisten?.();
      unwatch?.();
      unlisten = null;
      unwatch = null;
    },
  };
};

/**
 * Écoute des tables en temps réel.
 *
 * `onLive(true)` n'est émis qu'une fois l'écoute confirmée par le serveur : une table absente
 * de la publication `supabase_realtime` fait échouer l'écoute alors que le canal est ouvert.
 */
export const watchTables = (client, name, tables, { onChange, onLive }) => {
  if (!tables.length) return () => {};
  let stopped = false;
  const setLive = (value) => { if (!stopped) onLive?.(value); };
  const channel = client.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`);
  tables.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
    if (stopped) return;
    setLive(true);
    // Suppression ou ligne non transmise : aucune colonne à examiner.
    onChange(table, Object.keys(payload?.new || {}).length ? payload.new : null);
  }));
  channel.on('system', {}, (message) => {
    if (message?.extension === 'postgres_changes') setLive(message.status === 'ok');
  });
  channel.subscribe((status) => { if (status !== 'SUBSCRIBED') setLive(false); });
  return () => {
    stopped = true;
    client.removeChannel(channel);
  };
};
