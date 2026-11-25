import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recetteProblems, recetteServer } from '../helpers/recette.ts';

test('une base de recette doit être désignée explicitement', () => {
  assert.equal(recetteProblems({}).length, 2);
  assert.deepEqual(recetteProblems({ RECETTE_SUPABASE_URL: 'https://recette.example', RECETTE_SUPABASE_ANON_KEY: 'x' }), []);
});

test('la base du fichier .env est refusée, même avec un chemin ou une barre finale', (t) => {
  let url = '';
  try { url = readFileSync('.env', 'utf8').match(/^\s*VITE_SUPABASE_URL\s*=\s*(\S+)/m)?.[1] || ''; } catch { /* pas de .env */ }
  if (!/^https?:/.test(url)) return t.skip('pas de .env');
  for (const suffix of ['', '/', '/rest/v1']) {
    assert.match(recetteProblems({ RECETTE_SUPABASE_URL: url.replace(/\/$/, '') + suffix, RECETTE_SUPABASE_ANON_KEY: 'x' }).join(), /refusé/);
  }
  return undefined;
});

test('le serveur de recette n’est jamais celui du développement', () => {
  const server = recetteServer();
  assert.equal(server.reuseExistingServer, false);
  assert.doesNotMatch(server.url, /:5173/);
});
