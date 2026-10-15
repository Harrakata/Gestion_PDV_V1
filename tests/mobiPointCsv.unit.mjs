import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBI_POINT_CSV_COLUMNS, prepareMobiPointImport } from '../src/lib/mobiPointCsv.js';
import { buildCsv, parseCsv } from '../src/lib/csv.js';

const context = () => ({
  points: [],
  regions: [{ nom: 'Kinshasa', codeRegion: 'KIN' }],
  agences: [{ nom: 'Gombe', codePDV: '1101', region: 'Kinshasa' }],
  terminaux: [{ reference: 'M1', modele: 'P390', statut: 'Actif' }, { reference: 'M2', modele: 'P390', statut: 'Actif' }],
  guichetieres: [
    { matricule: '101', prenom: 'Ada', nom: 'A', agenceAssigne: 'Gombe' },
    { matricule: '102', prenom: 'Lea', nom: 'B', agenceAssigne: 'Gombe' },
  ],
  today: '2026-10-15',
  uidFactory: () => 'new-uid',
});

const row = (overrides = {}) => ({
  codePointVente: 'PDV-1', region: 'KIN', agenceNom: 'Gombe', terminalReference: 'M1',
  guichetiereMatricule: '101', dateDebutValidite: '15/10/2026', dateFinValidite: '', ...overrides,
});

test('prépare un nouveau point avec les libellés du référentiel et les dates ISO', () => {
  const { rows, errors } = prepareMobiPointImport([row()], context());
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    pointVenteUid: 'new-uid', codePointVente: 'PDV-1', region: 'Kinshasa',
    agenceNom: 'Gombe', agenceCodePDV: '1101', terminalReference: 'M1', terminalModele: 'P390',
    guichetiereMatricule: '101', guichetiereNom: 'Ada A', dateDebutValidite: '2026-10-15',
    dateFinValidite: null, statut: 'Actif',
  });
});

test('le CSV exporté conserve les colonnes reconnues par l’import', () => {
  const { headers, records } = parseCsv(buildCsv([row()], MOBI_POINT_CSV_COLUMNS));
  assert.deepEqual(headers, MOBI_POINT_CSV_COLUMNS);
  assert.deepEqual(records, [row()]);
});

test('bloque les doublons et les chevauchements avant toute écriture', () => {
  const result = prepareMobiPointImport([
    row(),
    row({ codePointVente: 'pdv-1', terminalReference: 'M2', guichetiereMatricule: '102' }),
    row({ codePointVente: 'PDV-2', guichetiereMatricule: '102' }),
  ], context());
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.errors.map(({ line }) => line), [3, 4]);
  assert.match(result.errors[0].message, /existe déjà/);
  assert.match(result.errors[1].message, /chevauchante/);
});

test('rejette un code déjà historisé et une guichetière affectée ailleurs', () => {
  const options = context();
  options.points = [{ id: 1, codePointVente: 'PDV-1', statut: 'Inactif' }];
  options.guichetieres[1].agenceAssigne = 'Autre agence';
  const result = prepareMobiPointImport([
    row(),
    row({ codePointVente: 'PDV-2', terminalReference: 'M2', guichetiereMatricule: '102' }),
  ], options);
  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 2);
});
