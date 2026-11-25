// Configuration par défaut : elle utilise le serveur de développement, donc la base du .env.
export default () => {
  if (process.env.E2E_ISOLATED_ENV === '1' || process.env.RUN_MUTATING_TESTS === '1') {
    throw new Error('Tests de recette : utiliser `npm run test:regression:authenticated` ou `npm run test:regression:mutating` (la configuration par défaut vise la base du fichier .env).');
  }
};
