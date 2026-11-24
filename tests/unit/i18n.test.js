import test from 'node:test';
import assert from 'node:assert/strict';

import { findMissing, readDictionary } from '../../scripts/i18n.mjs';

const { text, patterns, mixed } = readDictionary();
const slots = (value) => new Set([...value.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1])));

test('tous les textes affichés ont une traduction (npm run i18n)', () => {
  assert.deepEqual(findMissing().map((entry) => `${entry.file} : ${entry.key}`), []);
});

test('une traduction n’utilise que les valeurs de la phrase d’origine', () => {
  const check = (key, value, count) => slots(value).forEach((index) => assert.ok(index < count, `${key} → ${value}`));
  Object.entries(patterns).forEach(([key, value]) => check(key, value, key.split('{}').length - 1));
  Object.entries(mixed).forEach(([key, value]) => check(key, value, key.split('¦').filter((slot) => slot === '{}').length));
});

test('une traduction n’est pas retraduite', () => {
  Object.entries(text).forEach(([key, value]) => assert.ok(!(value in text) || text[value] === value, `${key} → ${value} → ${text[value]}`));
});

test('un prénom courant n’est pas une entrée du dictionnaire', () => {
  ['Rose', 'Sam', 'Mar', 'Claire', 'Pierre', 'Marine', 'Prince', 'Grace', 'Blanche', 'Constant'].forEach((name) => assert.ok(!(name in text), name));
});
