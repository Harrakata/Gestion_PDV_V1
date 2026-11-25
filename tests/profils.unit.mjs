import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPLOITATION_SPACE_KEY,
  countAccessLevels,
  countSpaceAccessLevels,
  createDefaultFormData,
  getTabAndDescendantKeys,
} from '../src/features/profils/profileModel.js';
import { fetchManagedSpaceUsers, fetchProfilesAndTemplates } from '../src/features/profils/profileRepository.js';

test('initialise un formulaire indépendant et des droits désactivés', () => {
  const first = createDefaultFormData();
  const second = createDefaultFormData();
  first.permissions[Object.keys(first.permissions)[0]] = 'write';
  assert.equal(countAccessLevels(second.permissions).allowedCount, 0);
});

test('compte les droits normalisés et cible les descendants exacts', () => {
  const keys = [{ key: 'etat' }, { key: 'etat.detail' }, { key: 'etat2' }];
  assert.deepEqual(getTabAndDescendantKeys(keys, 'etat'), ['etat', 'etat.detail']);
  const permissions = { [Object.keys(createDefaultFormData().permissions)[0]]: 'read' };
  assert.deepEqual(countSpaceAccessLevels(EXPLOITATION_SPACE_KEY, permissions), {
    writeCount: 0, readCount: 1, allowedCount: 1,
  });
});

const createClient = (responses) => {
  const calls = [];
  const client = {
    from(table) {
      const call = { table };
      calls.push(call);
      const query = {
        select(columns) { call.columns = columns; return query; },
        order(column, options) { call.order = [column, options]; return query; },
        eq(column, value) { call.filter = [column, value]; return query; },
        then(resolve, reject) { return Promise.resolve(responses[table]).then(resolve, reject); },
      };
      return query;
    },
  };
  return { client, calls };
};

test('charge profils et modèles dans l’ordre attendu', async () => {
  const { client, calls } = createClient({
    profils_exploitation: { data: [{ id: 1 }], error: null },
    profil_utilisateur_templates: { data: [{ id: 2 }], error: null },
  });
  const result = await fetchProfilesAndTemplates(client);
  assert.equal(result[0].data[0].id, 1);
  assert.equal(result[1].data[0].id, 2);
  assert.deepEqual(calls.map(({ table, order }) => [table, order[0]]), [
    ['profils_exploitation', 'created_at'],
    ['profil_utilisateur_templates', 'nom'],
  ]);
});

test('applique le filtre actif et conserve les erreurs par espace', async () => {
  const failure = new Error('query failed');
  const { client, calls } = createClient({
    guichetieres: { data: [{ id: 1 }], error: null },
    techniciens: { data: null, error: failure },
  });
  const result = await fetchManagedSpaceUsers([
    { spaceKey: 'espace-guichetiere' },
    { spaceKey: 'espace-technicien' },
    { spaceKey: 'espace-inconnu' },
  ], client);
  assert.deepEqual(result.users, {
    'espace-guichetiere': [{ id: 1 }],
    'espace-technicien': [],
    'espace-inconnu': [],
  });
  assert.deepEqual(calls.find(({ table }) => table === 'guichetieres').filter, ['is_current', true]);
  assert.equal(result.errors[0].error, failure);
  assert.equal(result.errors[0].spaceKey, 'espace-technicien');
});
