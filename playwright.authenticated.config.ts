import baseConfig from './playwright.config';
import { RECETTE_PORT, recetteServer } from './tests/helpers/recette';

// Parcours connectés à la base de recette (jamais celle du .env).
// Les scénarios d'écriture explicites sont séparés (playwright.mutations.config.ts).
export default {
  ...baseConfig,
  testMatch: /[\/](?:0[1-3]|05|07|10)-[^\/]+\.spec\.ts$/,
  globalSetup: './tests/helpers/guardRecette.ts',
  use: { ...baseConfig.use, baseURL: `http://localhost:${RECETTE_PORT}` },
  webServer: recetteServer(),
};
