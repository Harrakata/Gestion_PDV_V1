import test from 'node:test';
import assert from 'node:assert/strict';

import { RESOURCE_MODES, RESOURCE_PROFILES, presenceThresholds, resolveResourceMode } from '../../src/lib/resourceMode.js';
import { createLiveFeed, LIVE_FEED_DELAYS } from '../../src/lib/liveFeed.js';
import { createNavigationLog } from '../../src/lib/navigationLog.js';
import { shouldSendSyncHealth } from '../../src/lib/syncHealthPolicy.js';

const MINUTE = 60_000;
const flush = async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); };
const { dev, demo, prod } = RESOURCE_PROFILES;

test('priorité : appareil, déploiement, client, puis défaut', () => {
  const all = { device: 'dev', imposed: 'prod', client: 'demo', isDevServer: false };
  assert.equal(resolveResourceMode(all), 'dev');
  assert.equal(resolveResourceMode({ ...all, device: null }), 'prod');
  assert.equal(resolveResourceMode({ ...all, device: null, imposed: null }), 'demo');
  assert.equal(resolveResourceMode({ isDevServer: false }), 'demo');
  assert.equal(resolveResourceMode({ isDevServer: true }), 'dev');
  // Valeur inconnue : ignorée.
  for (const wrong of ['', 'PROD', 'autre', 'toString', undefined, null]) {
    assert.equal(resolveResourceMode({ device: wrong, imposed: wrong, client: 'prod' }), 'prod');
  }
});

test('chaque mode consomme moins que le suivant', () => {
  assert.deepEqual(RESOURCE_MODES.map(({ value }) => value), Object.keys(RESOURCE_PROFILES));
  for (const [less, more] of [[dev, demo], [demo, prod]]) {
    for (const key of ['live', 'liveHidden', 'fallback', 'fallbackHidden', 'freshness']) assert.ok(less.feed[key] >= more.feed[key], key);
    for (const key of ['blockedDevices', 'presence', 'syncHealthKeepAlive']) assert.ok(less[key] >= more[key], key);
    assert.ok(less.photo.maxSide <= more.photo.maxSide && less.photo.quality <= more.photo.quality);
  }
  assert.deepEqual([dev, demo, prod].map((profile) => profile.realtime), [false, true, true]);
});

test('Prod garde les délais d’origine', () => {
  for (const [key, value] of Object.entries(prod.feed)) assert.equal(value, LIVE_FEED_DELAYS[key], key);
  assert.deepEqual(presenceThresholds(prod), { online: 3 * MINUTE, idle: 15 * MINUTE });
});

test('présence : le seuil « En ligne » dépasse toujours l’intervalle du signal', () => {
  for (const profile of [dev, demo, prod]) {
    const { online, idle } = presenceThresholds(profile);
    assert.ok(online > profile.presence);
    assert.ok(idle > online);
  }
});

const openFeed = (t, profile, { visible = true } = {}) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const state = { visible, calls: 0, handlers: null };
  const feed = createLiveFeed({
    sources: [{ key: 'a', tables: ['a'], load: async () => { state.calls += 1; return state.calls; } }],
    env: {
      now: () => Date.now(),
      isVisible: () => state.visible,
      isOnline: () => true,
      listen: (handlers) => { state.handlers = handlers; return () => {}; },
    },
    delays: { ...LIVE_FEED_DELAYS, ...profile.feed },
  });
  feed.start();
  const advance = async (minutes) => { for (let i = 0; i < minutes; i += 1) { t.mock.timers.tick(MINUTE); await flush(); } };
  return { feed, state, advance };
};

test('Dev : lecture à l’ouverture, puis toutes les 30 minutes, jamais en arrière-plan', async (t) => {
  const { state, advance } = openFeed(t, dev);
  await flush();
  assert.equal(state.calls, 1);
  await advance(29);
  assert.equal(state.calls, 1);
  await advance(2);
  assert.equal(state.calls, 2);
  state.visible = false;
  state.handlers.onVisibility();
  await advance(24 * 60);
  assert.equal(state.calls, 2);
  state.visible = true;
  state.handlers.onVisibility();
  await flush();
  t.mock.timers.tick(300);
  await flush();
  assert.equal(state.calls, 3, 'relu au retour à l’écran');
});

test('cloche ouverte : relue si la donnée a plus de 10 secondes, pas à chaque clic', async (t) => {
  const { feed, state } = openFeed(t, dev);
  await flush();
  feed.freshen();
  await flush();
  assert.equal(state.calls, 1);
  t.mock.timers.tick(11_000);
  for (let i = 0; i < 5; i += 1) { feed.freshen(); await flush(); }
  assert.equal(state.calls, 2);
});

test('cloche ouverte avec le temps réel : aucune lecture', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  let calls = 0;
  let handlers = null;
  const feed = createLiveFeed({
    sources: [{ key: 'a', tables: ['a'], load: async () => { calls += 1; } }],
    watch: (given) => { handlers = given; return () => {}; },
    env: { now: () => Date.now(), isVisible: () => true, isOnline: () => true, listen: () => () => {} },
    delays: { ...LIVE_FEED_DELAYS, ...demo.feed },
  });
  feed.start();
  await flush();
  handlers.onLive(true);
  t.mock.timers.tick(2 * MINUTE);
  await flush();
  const before = calls;
  feed.freshen();
  await flush();
  assert.equal(calls, before);
});

test('journal de navigation : immédiat, regroupé ou coupé', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_700_000_000_000 });
  const run = (options) => {
    const saves = [];
    const log = createNavigationLog({ ...options, save: (events) => saves.push(events) });
    log.add({ path: '/a' });
    log.add({ path: '/b' });
    return { saves, log };
  };
  assert.deepEqual(run(prod.navigation).saves, [[{ path: '/a' }], [{ path: '/b' }]]);

  const grouped = run(demo.navigation);
  assert.deepEqual(grouped.saves, []);
  t.mock.timers.tick(MINUTE);
  assert.equal(grouped.saves.length, 1);
  assert.deepEqual(grouped.saves[0].map(({ path }) => path), ['/a', '/b']);
  assert.match(grouped.saves[0][0].at, /^2023-11-14T/); // date de la navigation, pas de l'envoi
  // Fermeture : ce qui reste est remis à l'appelant, une seule fois.
  grouped.log.add({ path: '/c' });
  assert.deepEqual(grouped.log.take().map(({ path }) => path), ['/c']);
  t.mock.timers.tick(5 * MINUTE);
  assert.equal(grouped.saves.length, 1);

  const off = run(dev.navigation);
  t.mock.timers.tick(60 * MINUTE);
  assert.deepEqual([off.saves, off.log.take()], [[], []]);
});

test('santé de la synchro en Dev : seulement s’il y a du nouveau', () => {
  const last = { signature: 'x', at: 0 };
  const send = (extra) => shouldSendSyncHealth({ signature: 'x', last, now: 10 * 24 * 3600_000, keepAlive: dev.syncHealthKeepAlive, ...extra });
  assert.equal(send({}), false);
  assert.equal(send({ signature: 'y' }), true);
  assert.equal(send({ justSynced: true }), true);
  assert.equal(send({ last: null }), true);
});
