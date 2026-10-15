import assert from 'node:assert/strict';
import test from 'node:test';
import { findMobiValidityConflict, isMobiPointCurrent, isValidMobiDate,
  mobiPeriodsOverlap, previousMobiDay } from '../src/lib/mobiPointValidity.js';

test('valide les dates réelles et ferme une version la veille de la suivante', () => {
  assert.equal(isValidMobiDate('2026-02-28'), true);
  assert.equal(isValidMobiDate('2026-02-30'), false);
  assert.equal(previousMobiDay('2026-03-01'), '2026-02-28');
  assert.equal(mobiPeriodsOverlap(
    { dateDebutValidite: '2026-02-01', dateFinValidite: '2026-02-28' },
    { dateDebutValidite: '2026-03-01', dateFinValidite: null },
  ), false);
});

test('détecte les périodes concurrentes d’un terminal ou d’une guichetière', () => {
  const existing = { id: 1, pointVenteUid: 'A', codePointVente: 'PDV001', terminalReference: 'M1',
    guichetiereMatricule: 'G1', dateDebutValidite: '2026-01-01', dateFinValidite: '2026-04-30' };
  const candidate = { id: 2, pointVenteUid: 'B', codePointVente: 'PDV002', terminalReference: 'M1',
    guichetiereMatricule: 'G2', dateDebutValidite: '2026-04-30', dateFinValidite: null };
  assert.equal(findMobiValidityConflict(candidate, [existing]), existing);
  assert.equal(findMobiValidityConflict({ ...candidate, dateDebutValidite: '2026-05-01' }, [existing]), undefined);
  assert.equal(findMobiValidityConflict({ ...candidate, terminalReference: 'M2', guichetiereMatricule: 'G1' }, [existing]), existing);
});

test('une fin planifiée reste active jusqu’au dernier jour inclus', () => {
  const point = { statut: 'Actif', dateDebutValidite: '2026-10-01', dateFinValidite: '2026-10-20' };
  assert.equal(isMobiPointCurrent(point, '2026-10-14'), true);
  assert.equal(isMobiPointCurrent(point, '2026-10-20'), true);
  assert.equal(isMobiPointCurrent(point, '2026-10-21'), false);
  assert.equal(isMobiPointCurrent({ ...point, statut: 'Inactif' }, '2026-10-14'), false);
});

test('une correction de fin conserve un chevauchement historique déjà présent sans l’étendre', () => {
  const previous = { id: 1, pointVenteUid: 'A', codePointVente: 'PDV001', terminalReference: 'M1',
    guichetiereMatricule: 'G1', dateDebutValidite: '2026-10-01', dateFinValidite: '2026-10-10' };
  const current = { ...previous, id: 2, dateDebutValidite: '2026-10-10', dateFinValidite: null };
  assert.equal(findMobiValidityConflict({ ...current, dateFinValidite: '2026-10-20' }, [previous, current], 2, current), undefined);
  assert.equal(findMobiValidityConflict({ ...current, dateDebutValidite: '2026-10-09' }, [previous, current], 2, current), previous);
  assert.equal(findMobiValidityConflict({ ...current, terminalReference: 'M2' }, [
    { ...previous, terminalReference: 'M2' }, current,
  ], 2, current)?.id, 1);
});
