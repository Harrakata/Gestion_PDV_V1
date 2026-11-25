import test from 'node:test';
import assert from 'node:assert/strict';

import { asFormulas, removeFormula, upsertFormula } from '../../src/features/salaires/customFormulasModel.js';
import { deleteCustomFormula, fetchCustomFormulas, saveCustomFormula } from '../../src/features/salaires/customFormulasRepository.js';

const transport = { id: '1', name: 'Transport', terms: [{ type: 'ccope', key: 'mt_enr' }] };
const panier = { id: '2', name: 'Panier', terms: [] };

/** app_settings en mémoire ; `fail` fait échouer la lecture ou l'écriture. */
const fakeClient = (stored, { fail } = {}) => {
  const state = { value: stored, operations: [] };
  const from = () => ({
    select: () => ({ eq: () => ({ limit: async () => (fail === 'read' ? { data: null, error: new Error('lecture') } : { data: state.value === undefined ? [] : [{ id: 3, value: state.value }], error: null }) }) }),
    update: ({ value }) => ({ eq: async () => { if (fail === 'write') return { error: new Error('écriture') }; state.operations.push('update'); state.value = value; return { error: null }; } }),
    insert: async ({ value }) => { state.operations.push('insert'); state.value = value; return { error: null }; },
  });
  return { from, state };
};

test('enregistrer une formule ne touche pas aux autres', async () => {
  const client = fakeClient([transport, panier]);
  await saveCustomFormula(client, { id: '2', name: 'Panier', terms: [{ type: 'param', key: 'P1' }] });
  assert.deepEqual(client.state.value, [transport, { id: '2', name: 'Panier', terms: [{ type: 'param', key: 'P1' }] }]);
  await saveCustomFormula(client, { id: '3', name: 'Prime nuit', terms: [] });
  assert.deepEqual(client.state.value.map(({ name }) => name), ['Transport', 'Panier', 'Prime nuit']);
  await deleteCustomFormula(client, '1');
  assert.deepEqual(client.state.value.map(({ name }) => name), ['Panier', 'Prime nuit']);
});

test('une formule ajoutée entre-temps par quelqu’un d’autre est conservée', async () => {
  const client = fakeClient([transport]);
  const shown = await fetchCustomFormulas(client); // affichage
  client.state.value = [...shown, panier]; // autre personne
  await saveCustomFormula(client, { ...transport, terms: [] });
  assert.deepEqual(client.state.value.map(({ name }) => name), ['Transport', 'Panier']);
});

test('première formule du client : réglage créé', async () => {
  const client = fakeClient(undefined);
  await saveCustomFormula(client, panier);
  assert.deepEqual([client.state.operations, client.state.value], [['insert'], [panier]]);
});

test('lecture ou écriture impossible : erreur signalée, rien n’est écrasé', async () => {
  const unreadable = fakeClient([transport], { fail: 'read' });
  await assert.rejects(saveCustomFormula(unreadable, panier), /lecture/);
  assert.deepEqual([unreadable.state.operations, unreadable.state.value], [[], [transport]]);
  await assert.rejects(saveCustomFormula(fakeClient([transport], { fail: 'write' }), panier), /écriture/);
});

test('règles pures : identifiants en texte ou en nombre, valeur inattendue', () => {
  assert.deepEqual(upsertFormula([{ id: 7, name: 'A', terms: [] }], { id: '7', name: 'B' }), [{ id: '7', name: 'B', terms: [] }]);
  assert.deepEqual(removeFormula([{ id: 7 }, { id: 8 }], '7'), [{ id: 8 }]);
  for (const value of [null, undefined, {}, 'x', [null, {}]]) assert.deepEqual(asFormulas(value), []);
});
