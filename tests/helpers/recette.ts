import { readFileSync } from 'node:fs';
import path from 'node:path';

// Garde-fous des tests connectés à une vraie base : jamais celle du fichier .env.
export const RECETTE_PORT = 5193;

const hostOf = (url = '') => { try { return new URL(url).host; } catch { return ''; } };
const envFileHost = () => {
  try {
    const line = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8').match(/^\s*VITE_SUPABASE_URL\s*=\s*(.*)$/m);
    return hostOf((line?.[1] || '').trim().replace(/^["']|["']$/g, ''));
  } catch {
    return '';
  }
};

/** Problèmes empêchant de viser la base de recette (liste vide = prêt). */
export const recetteProblems = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const problems: string[] = [];
  const host = hostOf(env.RECETTE_SUPABASE_URL);
  if (!host) problems.push('RECETTE_SUPABASE_URL : adresse du projet Supabase de recette requise');
  if (!env.RECETTE_SUPABASE_ANON_KEY) problems.push('RECETTE_SUPABASE_ANON_KEY : clé anon du projet de recette requise');
  if (host && host === envFileHost()) problems.push('RECETTE_SUPABASE_URL désigne la base du fichier .env : refusé');
  return problems;
};

/** Serveur dédié, branché sur la recette. */
export const recetteServer = () => ({
  command: `npx vite --port ${RECETTE_PORT} --strictPort`,
  url: `http://localhost:${RECETTE_PORT}`,
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    VITE_SUPABASE_URL: process.env.RECETTE_SUPABASE_URL || '',
    VITE_SUPABASE_ANON_KEY: process.env.RECETTE_SUPABASE_ANON_KEY || '',
    VITE_SENTRY_DSN: '',
    VITE_CACHE_DIR: 'node_modules/.vite-recette',
  },
});
