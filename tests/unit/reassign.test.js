import test from 'node:test';
import assert from 'node:assert/strict';

import { reassign } from '../../src/features/personnel/reassignRepository.js';

const chefs = () => [
  { id: 12, matricule: 'C1', nom: 'Traoré', prenom: 'Issa', email: 'issa@x.test', telephone: '0202', photo_url: 'p.jpg', agenceEnCharge: 'Gombe', codePDV: '001', auth_user_id: 'compte-1', is_current: true, valid_from: '2026-01-01', valid_to: null, mdp: null },
  { id: 13, matricule: 'C2', nom: 'Ba', prenom: 'Ali', email: 'ali@x.test', telephone: null, photo_url: null, agenceEnCharge: 'Matadi', codePDV: '003', auth_user_id: 'compte-2', is_current: true, valid_from: '2026-01-01', valid_to: null, mdp: null },
  { id: 5, matricule: 'C1', nom: 'Traoré', prenom: 'Issa', email: null, telephone: null, photo_url: null, agenceEnCharge: 'Limete', codePDV: '002', auth_user_id: null, is_current: false, valid_from: '2025-01-01', valid_to: '2026-01-01', mdp: null },
];

/** Table simulée ; `fail` : opération refusée. */
const setup = (fail = null) => {
  const rows = chefs();
  let nextId = 100;
  const error = { code: '42501', message: 'refus' };
  const client = { from: () => {
    let operation = 'select';
    let payload;
    let match = () => true;
    const run = (single) => {
      if (operation === fail) return { data: null, error };
      const hit = rows.filter(match);
      if (operation === 'insert') { const row = { id: nextId, ...payload }; nextId += 1; rows.push(row); return { data: single ? { id: row.id } : null, error: null }; }
      if (operation === 'update') hit.forEach((row) => Object.assign(row, payload));
      if (operation === 'delete') hit.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { data: hit, error: null };
    };
    const builder = {
      select: (columns) => { if (operation === 'select') builder.columns = columns.split(', '); return builder; },
      insert: (value) => { operation = 'insert'; payload = value; return builder; },
      update: (value) => { operation = 'update'; payload = value; return builder; },
      delete: () => { operation = 'delete'; return builder; },
      eq: (column, value) => { const previous = match; match = (row) => previous(row) && row[column] === value; return builder; },
      neq: (column, value) => { const previous = match; match = (row) => previous(row) && row[column] !== value; return builder; },
      limit: () => builder,
      single: async () => run(true),
      then: (resolve, reject) => {
        const result = run(false);
        if (operation === 'select' && result.data) result.data = result.data.map((row) => Object.fromEntries(builder.columns.map((column) => [column, row[column]])));
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  } };
  return { rows, client };
};
const move = (client, changes = {}) => reassign(client, {
  table: 'chefs_agence', matricule: 'C1', startsAt: '2026-11-25T00:00:00.000Z',
  assignment: { agenceEnCharge: 'Kintambo', codePDV: '009' }, takenMessage: (chef) => `${chef.prenom} est déjà là.`, ...changes,
});

test('la fiche en cours garde son identifiant, son compte et ses coordonnées', async () => {
  const { rows, client } = setup();
  const before = { ...rows[0] };
  await move(client);
  assert.deepEqual(rows[0], { ...before, agenceEnCharge: 'Kintambo', codePDV: '009', valid_from: '2026-11-25T00:00:00.000Z' });
  assert.equal(rows.filter((row) => row.matricule === 'C1' && row.is_current).length, 1);
});

test('l’ancienne affectation est archivée, sans compte ni mot de passe', async () => {
  const { rows, client } = setup();
  await move(client);
  assert.deepEqual(rows.at(-1), {
    id: 100, matricule: 'C1', nom: 'Traoré', prenom: 'Issa', email: 'issa@x.test', telephone: '0202', photo_url: 'p.jpg',
    agenceEnCharge: 'Gombe', codePDV: '001', valid_from: '2026-01-01', valid_to: '2026-11-25T00:00:00.000Z', is_current: false, auth_user_id: null,
  });
});

test('une agence sans code ne garde pas le code de l’ancienne', async () => {
  const { rows, client } = setup();
  await move(client, { assignment: { agenceEnCharge: 'Kintambo', codePDV: null } });
  assert.equal(rows[0].codePDV, null);
});

test('refus : place occupée, personne introuvable', async () => {
  for (const [changes, message] of [[{ assignment: { agenceEnCharge: 'Matadi', codePDV: '003' } }, 'Ali est déjà là.'], [{ matricule: 'C9' }, 'Chef actuel introuvable']]) {
    const { rows, client } = setup();
    await assert.rejects(move(client, changes), { message });
    assert.deepEqual(rows, chefs());
  }
  // Une affectation archivée (Limete) n'occupe pas la place.
  const { rows, client } = setup();
  await move(client, { assignment: { agenceEnCharge: 'Limete', codePDV: '002' } });
  assert.equal(rows[0].agenceEnCharge, 'Limete');
});

test('échec à n’importe quelle étape : rien n’a changé', async () => {
  for (const operation of ['select', 'insert', 'update']) {
    const { rows, client } = setup(operation);
    await assert.rejects(move(client), { code: '42501' });
    assert.deepEqual(rows, chefs(), operation);
  }
});
