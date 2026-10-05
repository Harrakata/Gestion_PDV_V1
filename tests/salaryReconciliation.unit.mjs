import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReconciliationRows, filterReconciliationRows, summarizeReconciliation, fetchReconciliationPages } from '../src/lib/salaryReconciliation.js';

const people = [
  { codePrepose: '1101', matricule: 'M01', prenom: 'Mélanie', nom: 'Lombay', agenceAssigne: 'Gombe' },
  { codePrepose: '1102', matricule: 'M02', prenom: 'Jean', nom: 'Dupont', agenceAssigne: 'Gare' },
];
const agencies = [
  { id: 'a1', nom: 'Gombe', region: 'Kinshasa', secteur: 'Lukunga', codePDV: '201' },
  { id: 'a2', nom: 'Gare', region: 'Sikasso', secteur: 'Centre', codePDV: '202' },
];
const operations = [
  { operateur: ' 1101 ', mt_enr: 1000, mt_anc: 50, mt_ane: 20, mt_anm: 10, mt_ans: 5, m_avance: 100, m_retrait: 15 },
  { operateur: '1102', mt_enr: 400 },
  { operateur: '999', mt_enr: 300 },
];
const payments = [{ guichetiere_code: 'M01', montant: 200 }, { guichetiere_code: '1102', montant: 400 }];
const rows = buildReconciliationRows(operations, payments, people, agencies);

test('joins matricule payments to the operator without duplicate gaps', () => {
  assert.equal(rows.length, 3);
  const row = rows.find((item) => item.code === '1101');
  assert.equal(row.nom, 'Mélanie Lombay');
  assert.equal(row.soldeCaisse, 1000);
  assert.equal(row.ecart, -800);
  assert.equal(row.paymentCount, 1);
  assert.equal(row.region, 'Kinshasa');
});

test('does not merge ambiguous matricules or override an explicit code', () => {
  const references = [...people, { codePrepose: 'M01', matricule: 'M02', nom: 'Autre' }];
  const result = buildReconciliationRows(operations, [
    { guichetiere_code: 'M01', montant: 200 }, { guichetiere_code: 'M02', montant: 300 },
  ], references, agencies);
  assert.equal(result.find((row) => row.code === '1101').mtVerse, 0);
  assert.equal(result.find((row) => row.code === 'M01').mtVerse, 200);
  assert.equal(result.find((row) => row.code === 'M02').mtVerse, 300);
});

test('combines search words across fields, without case or accent sensitivity', () => {
  assert.deepEqual(filterReconciliationRows(rows, { search: 'MELANIE lukunga 1101' }).map((row) => row.code), ['1101']);
  assert.equal(filterReconciliationRows(rows, { search: 'melanie gare' }).length, 0);
  assert.equal(filterReconciliationRows(rows, { search: 'melanie gare', match: 'any', status: 'all' }).length, 2);
  assert.equal(filterReconciliationRows(rows, { search: '"melanie lombay" kinshasa' }).length, 1);
});

test('cross-filters identification, sources, geography, and inclusive amounts', () => {
  assert.equal(filterReconciliationRows(rows, { regions: ['Kinshasa'], agencies: ['Gombe'], min: '800', max: '800' }).length, 1);
  assert.equal(filterReconciliationRows(rows, { regions: ['Kinshasa'], agencies: ['Gare'] }).length, 0);
  assert.deepEqual(filterReconciliationRows(rows, { identity: 'unknown', source: 'no_payment' }).map((row) => row.code), ['999']);
  assert.equal(filterReconciliationRows(rows, { min: '900', max: '100' }).length, 0);
  assert.equal(filterReconciliationRows(rows, { status: 'ok' }).length, 1);
});

test('filtered totals exclude unrelated operators; missing and surplus do not cancel', () => {
  const selected = filterReconciliationRows(rows, { search: 'melanie' });
  assert.deepEqual(summarizeReconciliation(selected), { due: 1000, paid: 200, gap: -800, missing: 800, surplus: 0, unknown: 0 });
  const mixed = buildReconciliationRows([{ operateur: 'x', mt_enr: 100 }], [{ guichetiere_code: 'y', montant: 100 }], [], []);
  assert.deepEqual(summarizeReconciliation(mixed), { due: 100, paid: 100, gap: 0, missing: 100, surplus: 100, unknown: 2 });
});

test('keeps all 1666 operators available and sorts deterministically', () => {
  const many = buildReconciliationRows(Array.from({ length: 1666 }, (_, i) => ({ operateur: String(i), mt_enr: i + 1 })), [], [], []);
  assert.equal(filterReconciliationRows(many, {}).length, 1666);
  assert.equal(filterReconciliationRows(many, { sort: 'gap_asc' })[0].code, '0');
});

test('loads beyond the server limit even if pages are capped below the requested size', async () => {
  const source = Array.from({ length: 1201 }, (_, id) => ({ id }));
  const result = await fetchReconciliationPages(() => ({ range: async (from) => ({ data: source.slice(from, from + 200) }) }));
  assert.deepEqual(result, source);
});

test('rejects a partial load rather than presenting incomplete totals', async () => {
  await assert.rejects(fetchReconciliationPages(() => ({ range: async (from) => from ? { error: new Error('network') } : { data: [{ id: 1 }] } })), /network/);
});
