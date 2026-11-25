// Lint à cliquet : 0 erreur, et chaque type d'avertissement ne peut que baisser.
//   npm run lint:ratchet             compare à scripts/lint-baseline.json (échoue si ça monte)
//   npm run lint:ratchet -- --update enregistre la baisse (refuse une hausse)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(root, 'scripts/lint-baseline.json');

const results = await new ESLint({ cwd: root }).lintFiles(['src']);
const counts = {};
const files = {};
let errors = 0;
results.forEach(({ filePath, messages }) => messages.forEach(({ ruleId, severity, message, line }) => {
  if (severity === 2) {
    errors += 1;
    console.error(`ERREUR ${path.relative(root, filePath)}:${line} ${ruleId || ''} ${message}`);
    return;
  }
  // Les accès Supabase et les règles visuelles partagent une règle ESLint : on les sépare.
  const key = /^Accès Supabase/.test(message) ? 'acces-supabase' : ruleId || 'directive-inutile';
  counts[key] = (counts[key] || 0) + 1;
  (files[key] ||= []).push(`${path.relative(root, filePath).replace(/\\/g, '/')}:${line}`);
}));

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const keys = [...new Set([...Object.keys(baseline), ...Object.keys(counts)])].sort();
const up = keys.filter((key) => (counts[key] || 0) > (baseline[key] || 0));
const down = keys.filter((key) => (counts[key] || 0) < (baseline[key] || 0));

keys.forEach((key) => console.log(`${key.padEnd(34)} ${String(baseline[key] || 0).padStart(4)} → ${String(counts[key] || 0).padStart(4)}${up.includes(key) ? '  ▲ en hausse' : ''}`));

/** Fichiers modifiés non commités : c'est là que se trouve presque toujours la hausse. */
const changedFiles = () => {
  try {
    return execSync('git status --porcelain -uall -- src', { cwd: root, encoding: 'utf8' })
      .split('\n').map((row) => row.slice(3).trim().replace(/^"|"$/g, '')).filter(Boolean);
  } catch {
    return [];
  }
};

if (errors || up.length) {
  const changed = new Set(changedFiles());
  up.forEach((key) => {
    const here = files[key].filter((place) => changed.has(place.split(':')[0]));
    const places = here.length ? `Dans les fichiers modifiés :\n  ${here.slice(0, 20).join('\n  ')}` : 'Détail : npx eslint src';
    console.error(`\n${key} : ${counts[key] - (baseline[key] || 0)} de plus. ${places}`);
  });
  console.error(`\n${errors} erreur(s), ${up.length} type(s) d'avertissement en hausse.`);
  process.exit(1);
}
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, `${JSON.stringify(Object.fromEntries(Object.entries(counts).sort()), null, 2)}\n`);
  console.log('\nRéférence enregistrée.');
} else if (down.length) {
  console.log('\nDes avertissements ont été résorbés : `npm run lint:ratchet -- --update` enregistre le gain.');
}
