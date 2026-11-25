import test from 'node:test';
import assert from 'node:assert/strict';

import { findByMessage, findByTarget, targetFilters } from '../../supabase/functions/_shared/pushRecipients.js';

/** Client Supabase minimal. */
const fakeClient = (tables) => {
  const reads = [];
  const from = (table) => {
    reads.push(table);
    let rows = tables[table] || [];
    const builder = {
      select: () => builder,
      eq: (column, value) => { rows = rows.filter((row) => String(row[column]) === String(value)); return builder; },
      in: (column, values) => { rows = rows.filter((row) => values.map(String).includes(String(row[column]))); return builder; },
      order: () => builder,
      range: async (start, end) => ({ data: rows.slice(start, end + 1), error: null }),
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
    };
    return builder;
  };
  return { from, reads };
};

const agences = [
  { id: 1, nom: 'Gombe', codePDV: '001', region: 'Nord', secteur: 'S1', is_current: true },
  { id: 2, nom: 'Limete', codePDV: '002', region: 'Nord', secteur: 'S2', is_current: true },
  { id: 3, nom: 'Matadi', codePDV: '003', region: 'Sud', secteur: 'S3', is_current: true },
  { id: 4, nom: 'Ancien Gombe', codePDV: '001', region: 'Nord', secteur: 'S1', is_current: false },
];
const tables = {
  agences,
  guichetieres: [
    { id: 'g1', matricule: 'A1', agenceAssigne: 'Gombe', is_current: true },
    { id: 'g2', matricule: 'A2', agenceAssigne: 'Limete', is_current: true },
    { id: 'g3-ancienne', matricule: 'A3', agenceAssigne: 'Gombe', is_current: false },
    { id: 'g3', matricule: 'A3', agenceAssigne: 'Matadi', is_current: true }, // mutée : l'abonnement porte l'ancien identifiant
    { id: 'g4', matricule: 'A4', agenceAssigne: 'Ancien Gombe', is_current: true }, // agence renommée
    { id: 'g5', matricule: 'A5', agenceAssigne: 'Gombe', is_current: false }, // partie
  ],
  chefs_agence: [
    { id: 11, matricule: 'C1', agenceEnCharge: 'Ancien nom', codePDV: '001', is_current: true },
    { id: 12, matricule: 'C2', agenceEnCharge: 'Matadi', codePDV: null, is_current: true },
  ],
  chefs_secteur: [{ id: 21, matricule: 'S1', secteurEnCharge: 'S1', is_current: true }, { id: 22, matricule: 'S2', secteurEnCharge: 'S2', is_current: true }],
  validateurs_paiement_gain: [{ id: 31, regionAssignee: 'Nord' }, { id: 32, regionAssignee: 'Sud' }],
  push_subscriptions: [
    ['g1', 'guichetiere'], ['g2', 'guichetiere'], ['g3-ancienne', 'guichetiere'], ['g4', 'guichetiere'], ['g5', 'guichetiere'],
    ['inconnue', 'guichetiere'], [null, 'guichetiere'],
    ['7', 'technicien'], ['8', 'technicien'], ['11', 'chef_agence'], ['12', 'chef_agence'],
    ['21', 'chef_secteur'], ['22', 'chef_secteur'], ['31', 'directeur_regional'], ['32', 'directeur_regional'],
    ['expl', 'exploitation'],
  ].map(([user_id, role], index) => ({ id: index + 1, endpoint: `https://push/${user_id}`, user_id, role })),
};

const send = async (message, roles) => {
  const client = fakeClient({ ...tables, messages_exploitation: [{ id: 5, titre: 'Titre', corps: 'Corps', actif: true, ...message }] });
  const deliveries = await findByMessage(client, 5, roles);
  return { ids: deliveries.map(({ subscription }) => subscription.user_id), deliveries, reads: client.reads };
};

test('message sans périmètre : tout le rôle, sans lire les fiches', async () => {
  const { ids, reads, deliveries } = await send({ destinataires: 'technicien' });
  assert.deepEqual(ids, ['7', '8']);
  assert.deepEqual(reads, ['messages_exploitation', 'push_subscriptions']);
  assert.deepEqual(deliveries[0].payload, { title: 'Titre', body: 'Corps', url: '/espace-technicien', openBell: true });
});

test('sélection individuelle : les personnes choisies, et elles seules', async () => {
  assert.deepEqual((await send({ destinataires: 'guichetiere', guichetiere_matricules: ['A1', 'A3'] })).ids, ['g1', 'g3-ancienne']);
  assert.deepEqual((await send({ destinataires: 'technicien', technicien_ids: [8] })).ids, ['8']);
});

test('par agence, secteur et région : guichetières', async () => {
  // Gombe : g1, et g4 dont la fiche porte l'ancien nom ; pas g3 (mutée) ni g5 (partie).
  assert.deepEqual((await send({ destinataires: 'guichetiere', agence_nom: 'Gombe' })).ids, ['g1', 'g4']);
  assert.deepEqual((await send({ destinataires: 'guichetiere', secteur_nom: 'S2' })).ids, ['g2']);
  assert.deepEqual((await send({ destinataires: 'guichetiere', region_nom: 'Sud' })).ids, ['g3-ancienne']);
});

test('par agence, secteur et région : chefs et directeurs', async () => {
  assert.deepEqual((await send({ destinataires: 'chef_agence', agence_nom: 'Gombe' })).ids, ['11']);
  assert.deepEqual((await send({ destinataires: 'chef_agence', region_nom: 'Sud' })).ids, ['12']);
  assert.deepEqual((await send({ destinataires: 'chef_secteur', secteur_nom: 'S2' })).ids, ['22']);
  assert.deepEqual((await send({ destinataires: 'directeur_regional', region_nom: 'Nord' })).ids, ['31']);
});

test('« tous » : guichetières du périmètre et techniciens, comme la cloche', async () => {
  const { ids, deliveries } = await send({ destinataires: 'tous', region_nom: 'Sud' });
  assert.deepEqual(ids, ['g3-ancienne', '7', '8']);
  assert.deepEqual(deliveries.map(({ payload }) => payload.url), ['/espace-guichetiere', '/espace-technicien', '/espace-technicien']);
});

test('espace coupé, message désactivé ou absent, remontée : personne', async () => {
  assert.deepEqual((await send({ destinataires: 'tous' }, ['technicien'])).ids, ['7', '8']);
  assert.deepEqual((await send({ destinataires: 'guichetiere' }, [])).ids, []);
  assert.deepEqual((await send({ destinataires: 'guichetiere', actif: false })).ids, []);
  assert.deepEqual((await send({ id: 99, destinataires: 'guichetiere' })).ids, []);
  assert.deepEqual((await send({ destinataires: 'exploitation' })).ids, []);
});

test('cible explicite : critères cumulés, jamais tout le monde par défaut', async () => {
  const find = async (target) => (await findByTarget(fakeClient(tables), target)).map((row) => row.user_id);
  assert.deepEqual(await find({ role: 'technicien', user_id: 7 }), ['7']);
  assert.deepEqual(await find({ role: 'guichetiere', user_id: ['g1', 'g2', '7'] }), ['g1', 'g2']);
  assert.deepEqual(await find({ role: 'guichetiere', user_id: [] }), []);
  for (const target of [undefined, null, {}, { role: '' }, { autre: 'x' }]) {
    assert.equal(targetFilters(target), null);
    assert.deepEqual(await find(target), []);
  }
});

test('longue liste et plus de 1 000 abonnements', async () => {
  const push_subscriptions = Array.from({ length: 2300 }, (_, index) => ({ id: index, endpoint: `e${index}`, user_id: `g${index}`, role: 'guichetiere' }));
  const wanted = push_subscriptions.filter((_, index) => index % 3 === 0).map((row) => row.user_id);
  const rows = await findByTarget(fakeClient({ push_subscriptions }), { role: 'guichetiere', user_id: wanted });
  assert.deepEqual(rows.map((row) => row.user_id), wanted);
});
