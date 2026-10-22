import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CLIENT_CURRENCY,
  formatCompactCurrencyValue,
  formatCurrencyValue,
  normalizeClientCurrency,
} from '../../src/lib/currency.js';

test('normalise les codes de devise supportés', () => {
  assert.equal(normalizeClientCurrency(' eur '), 'EUR');
  assert.equal(normalizeClientCurrency('xAf'), 'XAF');
});

test('revient à XOF pour une devise absente ou non supportée', () => {
  assert.equal(normalizeClientCurrency(''), DEFAULT_CLIENT_CURRENCY);
  assert.equal(normalizeClientCurrency('ZZZ'), DEFAULT_CLIENT_CURRENCY);
});

test('formate les montants avec la devise du client', () => {
  const euro = formatCurrencyValue(1234, 'EUR');
  assert.match(euro, /1[\s\u00a0\u202f]?234/);
  assert.match(euro, /€/);

  const compact = formatCompactCurrencyValue(1_500_000, 'USD');
  assert.match(compact, /1,5/);
  assert.match(compact, /\$US|USD|\$/);
});

test('préserve un état vide pour les valeurs non numériques', () => {
  assert.equal(formatCurrencyValue(null, 'EUR'), '—');
  assert.equal(formatCurrencyValue('invalide', 'EUR'), '—');
});
