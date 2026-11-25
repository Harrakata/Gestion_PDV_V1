import test from 'node:test';
import assert from 'node:assert/strict';

import { RETENTION_OPTIONS, cutoffOf, deletesMore, fromOption, retentionDays, toOption } from '../../src/features/activite/activityRetentionModel.js';

test('durée conservée : lue comme en base, jamais moins de 30 jours, tout conserver par défaut', () => {
  assert.equal(retentionDays({ days: 90 }), 90);
  assert.equal(retentionDays({ days: '365' }), 365);
  assert.equal(retentionDays({ days: 0 }), 30);
  for (const setting of [null, undefined, {}, { days: null }, { days: 'tout' }, { days: -5 }, { days: 1.5 }, { days: '30; drop' }]) assert.equal(retentionDays(setting), null);
});

test('choix de l’écran : aller-retour sans perte', () => {
  for (const { value } of RETENTION_OPTIONS) assert.equal(toOption(fromOption(value)), value);
  assert.deepEqual(RETENTION_OPTIONS.map(({ value }) => fromOption(value)), [null, 30, 90, 365]);
});

test('seul un choix qui supprime davantage demande une confirmation', () => {
  assert.equal(deletesMore(30, null), true);
  assert.equal(deletesMore(30, 90), true);
  assert.equal(deletesMore(90, 30), false);
  assert.equal(deletesMore(null, 30), false);
  assert.equal(deletesMore(null, null), false);
});

test('date limite', () => {
  assert.equal(cutoffOf(30, Date.parse('2026-11-25T10:00:00Z')), '2026-10-26T10:00:00.000Z');
});
