import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ANIMATED_ROWS, MAX_ROW_DELAY, rowDelay, rowEntrance } from '../../src/lib/rowEntrance.js';

test('le retard d’une ligne est plafonné', () => {
  assert.equal(rowDelay(0), 0);
  assert.equal(rowDelay(2, 0.05), 0.1);
  for (const index of [10, 100, 10_000]) assert.equal(rowDelay(index, 0.05), MAX_ROW_DELAY);
});

test('les premières lignes apparaissent en glissant, les suivantes sont affichées directement', () => {
  assert.deepEqual(rowEntrance(1, { y: 12, step: 0.02 }), { initial: { opacity: 0, x: 0, y: 12 }, animate: { opacity: 1, x: 0, y: 0 }, transition: { delay: 0.02 } });
  assert.deepEqual(rowEntrance(3, { x: -8 }).initial, { opacity: 0, x: -8, y: 0 });
  assert.equal(rowEntrance(ANIMATED_ROWS - 1, { y: 12 }).initial.opacity, 0);
  assert.equal(rowEntrance(ANIMATED_ROWS, { y: 12 }).initial, false);
});

test('aucun écran ne retarde ses lignes sans plafond', () => {
  const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.jsx?$/.test(entry.name) ? [file] : [];
  });
  const root = path.resolve(import.meta.dirname, '../../src');
  const offenders = sources(root).filter((file) => /delay:\s*\(?\s*(index|idx|i|rowIndex)\s*\*/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map((file) => path.relative(root, file)), [], 'utiliser rowEntrance ou rowDelay (src/lib/rowEntrance.js)');
});
