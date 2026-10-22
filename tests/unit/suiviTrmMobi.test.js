import test from 'node:test';
import assert from 'node:assert/strict';

import {
  associateMobiReferenceWithDailyState,
  chunkMobiTerminalReferences,
  fetchLatestMobiSuiviRows,
  normalizeMobiTerminalReference,
} from '../../src/lib/suiviTrmMobi.js';

test('normalizeMobiTerminalReference normalise les espaces et la casse', () => {
  assert.equal(normalizeMobiTerminalReference(' telpo390-0002 '), 'TELPO390-0002');
  assert.equal(normalizeMobiTerminalReference(null), '');
});

test('associateMobiReferenceWithDailyState conserve tout le référentiel', () => {
  const terminals = [
    { id: 1, reference: 'TELPO390-0002', modele: 'TELP390', statut: 'Actif' },
    { id: 2, reference: 'TELPO390-0003', modele: 'TELP390', statut: 'Inactif' },
  ];
  const dailyRows = [
    { id_trm_mobi: 'telpo390-0002', date_suivi: '2026-10-19', hors_service: 0 },
    { id_trm_mobi: 'TELPO390-9999', date_suivi: '2026-10-19', hors_service: 7 },
  ];

  assert.deepEqual(associateMobiReferenceWithDailyState(terminals, dailyRows), [
    {
      id_trm_mobi: 'TELPO390-0002',
      date_suivi: '2026-10-19',
      hors_service: 0,
      terminal_id: 1,
      terminal_modele: 'TELP390',
      terminal_statut: 'Actif',
      terminal_date_mise_en_service: null,
      has_suivi_state: true,
      has_daily_state: true,
    },
    {
      id_trm_mobi: 'TELPO390-0003',
      terminal_id: 2,
      terminal_modele: 'TELP390',
      terminal_statut: 'Inactif',
      terminal_date_mise_en_service: null,
      has_suivi_state: false,
      has_daily_state: false,
    },
  ]);
});

test('chunkMobiTerminalReferences découpe un grand référentiel sans doublon', () => {
  const references = Array.from({ length: 2386 }, (_, index) => `TELPO390-${String(index).padStart(4, '0')}`);
  references.push(' TELPO390-0000 ', '', null);

  const chunks = chunkMobiTerminalReferences(references, 200);

  assert.equal(chunks.length, 12);
  assert.equal(chunks.flat().length, 2386);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
  assert.equal(chunks[0][0], 'TELPO390-0000');
  assert.equal(chunks.at(-1).at(-1), 'TELPO390-2385');
});

test('fetchLatestMobiSuiviRows récupère un dernier état par terminal via la RPC', async () => {
  const rpcCalls = [];
  const rowsByReference = {
    'TELPO390-0002': { id_trm_mobi: 'TELPO390-0002', date_suivi: '2026-10-19', hors_service: 0 },
    'TELPO390-0003': { id_trm_mobi: 'TELPO390-0003', date_suivi: '2025-08-12', hors_service: 10 },
    'TELPO390-0004': { id_trm_mobi: 'TELPO390-0004', date_suivi: '2026-01-05', hors_service: 2 },
  };
  const client = {
    schema(schema) {
      assert.equal(schema, 'public');
      return {
        rpc(name, params) {
          rpcCalls.push({ name, params });
          const data = (params.p_terminal_references || [])
            .map((reference) => rowsByReference[reference])
            .filter(Boolean);
          const builder = {
            select() { return builder; },
            order() { return builder; },
            async range() { return { data, error: null }; },
          };
          return builder;
        },
      };
    },
  };

  const result = await fetchLatestMobiSuiviRows(client, {
    references: ['TELPO390-0004', 'TELPO390-0002', 'TELPO390-0003'],
    columns: 'id_trm_mobi, hors_service',
    referenceChunkSize: 2,
  });

  assert.equal(result.error, null);
  assert.equal(result.dateSuivi, '2026-10-19');
  assert.deepEqual(result.data.map((row) => row.id_trm_mobi), [
    'TELPO390-0002',
    'TELPO390-0003',
    'TELPO390-0004',
  ]);
  assert.equal(rpcCalls.length, 2);
  assert.ok(rpcCalls.every((call) => call.name === 'get_latest_suivi_trm_mobi_v2'));
});
