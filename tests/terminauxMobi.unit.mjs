import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllMobiTerminals } from '../src/lib/terminauxMobi.js';
import { fetchAllSupabaseRows } from '../src/lib/supabasePages.js';

test('charge les 2 386 terminaux au-delà de la limite Supabase de 1 000 lignes', async () => {
  const records = Array.from({ length: 2386 }, (_, index) => ({ id: index + 1, reference: `MOBI-${String(index + 1).padStart(4, '0')}` }));
  const ranges = [];
  const query = {
    select: () => query,
    order: () => query,
    range: async (from, to) => {
      ranges.push([from, to]);
      return { data: records.slice(from, to + 1), error: null };
    },
  };
  const client = { from: (table) => {
    assert.equal(table, 'terminaux_mobi');
    return query;
  } };
  const result = await fetchAllMobiTerminals(client, 'id, reference');
  assert.equal(result.error, null);
  assert.deepEqual(result.data, records);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499], [1500, 1999], [2000, 2499]]);
});

test('ne présente pas une liste partielle si une page échoue', async () => {
  const failure = { message: 'Lecture interrompue' };
  const query = {
    select: () => query,
    order: () => query,
    range: async (from) => from === 0
      ? { data: Array.from({ length: 500 }, (_, index) => ({ id: index })), error: null }
      : { data: null, error: failure },
  };
  const result = await fetchAllMobiTerminals({ from: () => query }, 'id');
  assert.equal(result.data, null);
  assert.equal(result.error, failure);
});

test('charge toutes les versions des affectations Mobi', async () => {
  const records = Array.from({ length: 1201 }, (_, index) => ({ id: index + 1 }));
  const orders = [];
  const query = {
    select: () => query,
    order: (column, options) => { orders.push([column, options.ascending]); return query; },
    range: async (from, to) => ({ data: records.slice(from, to + 1), error: null }),
  };
  const client = { from: (table) => { assert.equal(table, 'points_vente_mobi'); return query; } };
  const result = await fetchAllSupabaseRows(client, 'points_vente_mobi', 'id', [['created_at', false], ['id', false]]);
  assert.deepEqual(result.data, records);
  assert.equal(result.error, null);
  assert.deepEqual(orders.slice(0, 2), [['created_at', false], ['id', false]]);
});
