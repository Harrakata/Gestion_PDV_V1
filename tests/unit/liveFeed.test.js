import test from 'node:test';
import assert from 'node:assert/strict';

import { createLiveFeed, LIVE_FEED_DELAYS, watchTables } from '../../src/lib/liveFeed.js';
import { createNotificationsRepository } from '../../src/features/notifications/notificationsRepository.js';
import { SYNC_HEALTH_KEEP_ALIVE_MS, shouldSendSyncHealth, syncHealthSignature } from '../../src/lib/syncHealthPolicy.js';

const MINUTE = 60_000;
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };

/** Flux sous horloge simulée : appels comptés, écran, réseau et temps réel pilotables. */
const setup = (t, { sources = [{ key: 'a', tables: ['table_a'] }], withWatch = true } = {}) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const state = { visible: true, online: true, calls: {}, fail: new Set(), lists: [], handlers: null, watch: null, stopped: 0 };
  const feed = createLiveFeed({
    sources: sources.map((source) => ({
      ...source,
      load: async (options) => {
        state.calls[source.key] = (state.calls[source.key] || 0) + 1;
        if (state.fail.has(source.key)) throw new Error('panne');
        return source.value ? source.value(options) : `${source.key}${state.calls[source.key]}`;
      },
    })),
    watch: withWatch ? (handlers) => { state.watch = handlers; return () => { state.stopped += 1; }; } : null,
    onChange: ({ values, complete }) => state.lists.push({ ...Object.fromEntries(values), complete }),
    env: {
      now: () => Date.now(),
      isVisible: () => state.visible,
      isOnline: () => state.online,
      listen: (handlers) => { state.handlers = handlers; return () => { state.handlers = null; }; },
    },
  });
  const pass = async (ms, step = 1000) => {
    for (let done = 0; done < ms; done += step) { t.mock.timers.tick(Math.min(step, ms - done)); await flush(); }
  };
  return { feed, state, pass, total: () => Object.values(state.calls).reduce((sum, n) => sum + n, 0) };
};

test('sans temps réel : une lecture par minute, au lieu de quatre auparavant', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await pass(10 * MINUTE);
  assert.equal(state.calls.a, 11); // 1 au démarrage + 10
  feed.stop();
});

test('temps réel confirmé : lecture de sécurité toutes les 5 minutes seulement', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await flush();
  state.watch.onLive(true);
  await pass(MINUTE); // relecture unique : un changement a pu passer avant l'écoute
  assert.equal(state.calls.a, 2);
  await pass(30 * MINUTE);
  assert.equal(state.calls.a, 8); // + 6 en 30 minutes
  feed.stop();
});

test('un changement ne relit que la source concernée, une fois par rafale', async (t) => {
  const { feed, state, pass } = setup(t, { sources: [{ key: 'a', tables: ['table_a'] }, { key: 'b', tables: ['table_b'] }] });
  feed.start();
  await flush();
  for (let i = 0; i < 20; i += 1) state.watch.onChange('table_a', { id: i });
  state.watch.onChange('table_inconnue');
  await pass(2000);
  assert.deepEqual(state.calls, { a: 2, b: 1 });
  assert.deepEqual(state.lists.at(-1), { a: 'a2', b: 'b1', complete: true });
  feed.stop();
});

test("un changement qui ne regarde pas l'utilisateur est ignoré ; une suppression est toujours relue", async (t) => {
  const { feed, state, pass } = setup(t, { sources: [{ key: 'a', tables: ['table_a'], concerns: (row) => row.agence === 'Gombe' }] });
  feed.start();
  await flush();
  state.watch.onChange('table_a', { agence: 'Autre' });
  await pass(2000);
  assert.equal(state.calls.a, 1);
  state.watch.onChange('table_a', { agence: 'Gombe' });
  await pass(2000);
  state.watch.onChange('table_a', null);
  await pass(2000);
  assert.equal(state.calls.a, 3);
  feed.stop();
});

test('un changement survenu pendant une lecture est relu ensuite', async (t) => {
  let release;
  const { feed, state, pass } = setup(t, { sources: [{ key: 'a', tables: ['table_a'], value: () => (state.calls.a === 2 ? new Promise((resolve) => { release = resolve; }) : 'ok') }] });
  feed.start();
  await flush();
  state.watch.onChange('table_a');
  await pass(1000);
  assert.equal(state.calls.a, 2); // lecture en cours
  state.watch.onChange('table_a');
  await pass(1000);
  assert.equal(state.calls.a, 2);
  release('ancien');
  await flush();
  assert.equal(state.calls.a, 3);
  feed.stop();
});

test('écran masqué : lectures espacées ; au retour, relecture si les données datent', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await flush();
  state.visible = false;
  state.handlers.onVisibility();
  await pass(4 * MINUTE);
  assert.equal(state.calls.a, 1);
  state.visible = true;
  state.handlers.onVisibility();
  await flush();
  assert.equal(state.calls.a, 2);
  // Allers-retours rapprochés : pas de nouvelle lecture.
  for (let i = 0; i < 10; i += 1) {
    state.visible = false; state.handlers.onVisibility();
    state.visible = true; state.handlers.onVisibility();
    await pass(2000);
  }
  assert.equal(state.calls.a, 2);
  feed.stop();
});

test('hors-ligne : aucun appel ; reprise au retour du réseau', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await flush();
  state.online = false;
  await pass(30 * MINUTE);
  assert.equal(state.calls.a, 1);
  state.online = true;
  state.handlers.onOnline();
  await flush();
  assert.equal(state.calls.a, 2);
  feed.stop();
});

test('temps réel perdu puis rétabli : reprise des lectures rapprochées, puis rattrapage', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await flush();
  state.watch.onLive(true);
  await pass(90_000);
  assert.equal(state.calls.a, 2);
  state.watch.onLive(false); // dernière lecture il y a 30 s
  await pass(3 * MINUTE);
  assert.equal(state.calls.a, 5);
  state.watch.onLive(true);
  await pass(MINUTE);
  assert.equal(state.calls.a, 6); // rattrapage
  await pass(4 * MINUTE);
  assert.equal(state.calls.a, 6);
  feed.stop();
});

test('une panne passagère conserve la valeur connue et réessaie', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await flush();
  state.watch.onLive(true);
  state.fail.add('a');
  state.watch.onChange('table_a');
  await pass(1000);
  assert.deepEqual(state.lists.at(-1), { a: 'a1', complete: true });
  state.fail.clear();
  await pass(MINUTE);
  assert.equal(state.lists.at(-1).a, 'a3');
  feed.stop();
});

test('première lecture en échec : signalée comme incomplète', async (t) => {
  const { feed, state } = setup(t);
  state.fail.add('a');
  feed.start();
  await flush();
  assert.deepEqual(state.lists, [{ a: undefined, complete: false }]);
  feed.stop();
});

test('minInterval : jamais plus souvent, même au retour à l’écran', async (t) => {
  const { feed, state, pass } = setup(t, { sources: [{ key: 'lent', minInterval: 15 * MINUTE }, { key: 'a', tables: ['table_a'] }] });
  feed.start();
  for (let i = 0; i < 14; i += 1) { await pass(MINUTE); state.handlers.onVisibility(); }
  assert.equal(state.calls.lent, 1);
  await pass(2 * MINUTE);
  assert.equal(state.calls.lent, 2);
  feed.stop();
});

test('afterSync : relue après l’envoi des écritures hors-ligne', async (t) => {
  const { feed, state } = setup(t, { sources: [{ key: 'a', afterSync: true }, { key: 'b' }] });
  feed.start();
  await flush();
  state.handlers.onSynced();
  await flush();
  assert.deepEqual(state.calls, { a: 2, b: 1 });
  feed.stop();
});

test('changement de contexte : la réponse de l’ancien contexte est écartée', async (t) => {
  let release;
  const { feed, state } = setup(t, { sources: [{ key: 'a', value: () => (state.calls.a === 1 ? new Promise((resolve) => { release = resolve; }) : 'nouveau') }] });
  feed.start();
  await flush();
  feed.refresh({ forget: true });
  release('ancien');
  await flush();
  assert.deepEqual(state.lists, [{ a: 'nouveau', complete: true }]);
  feed.stop();
});

test('arrêt : plus aucun appel, écoute fermée', async (t) => {
  const { feed, state, pass } = setup(t);
  feed.start();
  await flush();
  state.watch.onChange('table_a');
  feed.stop();
  await pass(30 * MINUTE);
  assert.equal(state.calls.a, 1);
  assert.equal(state.stopped, 1);
  assert.equal(state.handlers, null);
});

test('écoute : confirmée par le serveur, pas seulement ouverte', () => {
  const bindings = [];
  let statusCallback;
  const removed = [];
  const channel = { on: (type, filter, callback) => { bindings.push({ type, table: filter.table, callback }); return channel; }, subscribe: (callback) => { statusCallback = callback; } };
  const client = { channel: () => channel, removeChannel: (item) => removed.push(item) };
  const live = [];
  const changes = [];
  const stop = watchTables(client, 'test', ['table_a', 'table_b'], { onLive: (value) => live.push(value), onChange: (table, row) => changes.push([table, row]) });
  const system = bindings.find(({ type }) => type === 'system').callback;

  statusCallback('SUBSCRIBED');
  assert.deepEqual(live, []); // canal ouvert : rien ne prouve que les tables sont écoutées
  system({ extension: 'postgres_changes', status: 'error', message: 'Unable to subscribe' });
  assert.deepEqual(live, [false]);
  system({ extension: 'postgres_changes', status: 'ok' });
  statusCallback('CHANNEL_ERROR');
  assert.deepEqual(live, [false, true, false]);

  bindings.find(({ table }) => table === 'table_b').callback({ new: { id: 1 } });
  bindings.find(({ table }) => table === 'table_a').callback({ new: {}, old: { id: 1 } });
  assert.deepEqual(changes, [['table_b', { id: 1 }], ['table_a', null]]);

  stop();
  statusCallback('CLOSED');
  assert.equal(live.at(-1), true); // après l'arrêt, plus aucun signal
  assert.deepEqual(removed, [channel]);
  assert.equal(watchTables(client, 'vide', [], {})(), undefined);
});

// ── Lectures de la cloche ────────────────────────────────────────────────────
const fakeClient = (answer) => {
  const queries = [];
  const client = {
    from: (table) => {
      const query = { table, calls: [] };
      queries.push(query);
      const builder = new Proxy({}, {
        get: (_target, name) => (name === 'then'
          ? (resolve) => resolve(answer(query))
          : (...args) => { query.calls.push([name, ...args]); return builder; }),
      });
      return builder;
    },
  };
  return { client, queries };
};

test('un périmètre inconnu ne lit rien (au lieu de compter toutes les agences)', async () => {
  const { client, queries } = fakeClient(() => ({ data: [], count: 99, error: null, status: 200 }));
  const repository = createNotificationsRepository(client);
  assert.equal(await repository.countRows('demandes_paiement_gain', [['statutGlobal', 'x'], ['chefAgenceId', null]]), 0);
  assert.equal(await repository.countActiveTickets([['agence_nom', undefined]]), 0);
  assert.deepEqual(await repository.fetchDemandes('t', [['agence_nom', '']]), []);
  assert.equal(await repository.countRefused('pointages', 'x', undefined), 0);
  assert.equal(queries.length, 0);
});

test('tickets : ouverts et en retard en une seule lecture, seconde lecture si la liste est tronquée', async () => {
  const rows = [{ statut: 'ouvert', late: true }, { statut: 'en_cours', late: true }, { statut: 'ouvert', late: false }];
  const small = fakeClient(() => ({ data: rows, count: 3, error: null, status: 200 }));
  assert.deepEqual(await createNotificationsRepository(small.client).fetchTicketSummary((row) => row.late), { open: 2, overdue: 2 });
  assert.equal(small.queries.length, 1);

  const big = fakeClient((query) => (query.calls.some(([name, , options]) => name === 'select' && options?.head)
    ? { data: null, count: 1500, error: null, status: 200 }
    : { data: rows, count: 4000, error: null, status: 200 }));
  assert.deepEqual(await createNotificationsRepository(big.client).fetchTicketSummary((row) => row.late), { open: 1500, overdue: 2 });
  assert.equal(big.queries.length, 2);
});

test('panne passagère : erreur levée ; refus durable : rien à signaler', async () => {
  const count = (status) => createNotificationsRepository(fakeClient(() => ({ data: null, count: null, error: { message: 'x' }, status })).client).countRows('t');
  for (const status of [0, 401, 429, 500, 503]) await assert.rejects(count(status));
  for (const status of [400, 403, 404]) assert.equal(await count(status), 0);
});

test('messages : adresse de requête stable dans l’heure, expiration vérifiée à la seconde', async () => {
  const at = (time) => Date.parse(`2026-11-24T${time}Z`);
  let time = at('10:05:00');
  const { client, queries } = fakeClient(() => ({ data: [{ id: 1, expire_a: null }, { id: 2, expire_a: '2026-11-24T10:30:00Z' }], error: null, status: 200 }));
  const repository = createNotificationsRepository(client, { now: () => time });
  assert.deepEqual((await repository.fetchMessages()).map(({ id }) => id), [1, 2]);
  time = at('10:45:00');
  assert.deepEqual((await repository.fetchMessages()).map(({ id }) => id), [1]);
  assert.deepEqual(queries[0].calls, queries[1].calls);
  assert.ok(queries[0].calls.some(([name, value]) => name === 'or' && value === 'expire_a.is.null,expire_a.gt.2026-11-24T10:00:00.000Z'));
});

test('région et secteur de l’agence : lus une seule fois', async () => {
  const { client, queries } = fakeClient(() => ({ data: [{ region: 'Nord', secteur: 'S1' }], error: null, status: 200 }));
  const repository = createNotificationsRepository(client);
  assert.deepEqual(await repository.fetchGeo('Gombe'), { region: 'Nord', secteur: 'S1' });
  await repository.fetchGeo('Gombe');
  assert.deepEqual(await repository.fetchGeo(null), {});
  assert.equal(queries.length, 1);
});

// ── Santé de synchro ─────────────────────────────────────────────────────────
test('état de synchro : envoyé seulement s’il change, après une synchro, ou toutes les 30 minutes', () => {
  const row = { device_id: 'd1', pending_count: 0, last_seen_at: '10:00', updated_at: '10:00' };
  const signature = syncHealthSignature(row);
  const last = { signature, at: 1000 };
  assert.equal(syncHealthSignature({ ...row, last_seen_at: '10:05', updated_at: '10:05', last_sync_at: '10:05' }), signature);
  assert.equal(shouldSendSyncHealth({ signature, last: null, now: 1000 }), true);
  assert.equal(shouldSendSyncHealth({ signature, last, now: 1000 + 5 * MINUTE }), false);
  assert.equal(shouldSendSyncHealth({ signature, last, now: 1000 + 5 * MINUTE, justSynced: true }), true);
  assert.equal(shouldSendSyncHealth({ signature: syncHealthSignature({ ...row, pending_count: 2 }), last, now: 2000 }), true);
  assert.equal(shouldSendSyncHealth({ signature, last, now: 1000 + SYNC_HEALTH_KEEP_ALIVE_MS }), true);
  assert.equal(shouldSendSyncHealth({ signature, last, now: 0 }), true); // horloge reculée
});

test('les délais restent ordonnés', () => {
  const { live, liveHidden, fallback, fallbackHidden, freshness } = LIVE_FEED_DELAYS;
  assert.ok(liveHidden > live && live > fallback && fallbackHidden > fallback && freshness <= fallback);
});
