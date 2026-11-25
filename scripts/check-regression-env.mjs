const roles = [
  ['Exploitation', ['EXPLOITATION_EMAIL'], 'EXPLOITATION_PASSWORD'],
  ["Chef d'agence", ['CHEF_AGENCE_EMAIL', 'CHEF_AGENCE_IDENTIFIER'], 'CHEF_AGENCE_PASSWORD'],
  ['Chef de secteur', ['CHEF_SECTEUR_EMAIL', 'CHEF_SECTEUR_IDENTIFIER'], 'CHEF_SECTEUR_PASSWORD'],
  ['Guichetière', ['GUICHETIERE_EMAIL', 'GUICHETIERE_IDENTIFIER'], 'GUICHETIERE_PASSWORD'],
  ['Technicien', ['TECHNICIEN_EMAIL', 'TECHNICIEN_IDENTIFIER'], 'TECHNICIEN_PASSWORD'],
  ['Directeur régional', ['DIR_REGIONAL_EMAIL'], 'DIR_REGIONAL_PASSWORD'],
  ['Directeur général', ['DIR_GENERAL_EMAIL'], 'DIR_GENERAL_PASSWORD'],
];

const mutating = process.argv.includes('--mutating');
const required = roles;
const missing = required
  .filter(([, identifiers, password]) => !identifiers.some((name) => process.env[name]) || !process.env[password])
  .map(([label, identifiers, password]) => `${label} : ${identifiers.join(' ou ')} + ${password}`);

if (process.env.E2E_ISOLATED_ENV !== '1') {
  missing.push('Environnement : E2E_ISOLATED_ENV=1 requis sur une base de recette isolée');
}
// L'adresse est contrôlée à nouveau au lancement (tests/helpers/recette.ts) : jamais celle du .env.
for (const name of ['RECETTE_SUPABASE_URL', 'RECETTE_SUPABASE_ANON_KEY']) {
  if (!process.env[name]) missing.push(`Base de recette : ${name}`);
}
if (mutating && process.env.RUN_MUTATING_TESTS !== '1') {
  missing.push('Mutations : RUN_MUTATING_TESTS=1 requis');
}

if (missing.length) {
  process.stderr.write(`Préparation des tests incomplète :\n- ${missing.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Environnement ${mutating ? 'de mutations' : 'authentifié'} prêt.\n`);
}
