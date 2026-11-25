import baseConfig from './playwright.config';

// Tests sur fixtures et services simulés : aucune session ni base client requise.
//
// Le serveur est dédié (port et cache propres) et pointe vers une adresse qui n'existe
// pas ; le navigateur ne résout que localhost. Une requête oubliée par un test échoue
// donc au lieu d'atteindre une base réelle, en local comme en intégration continue.
const PORT = 5183;
const baseURL = `http://localhost:${PORT}`;

export default {
  ...baseConfig,
  globalSetup: undefined,
  testMatch: /[\/](?:1[2-9]|2[0-9]|3[0-7])-[^\/]+\.spec\.ts$/,
  use: {
    ...baseConfig.use,
    baseURL,
    launchOptions: { args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: 'https://simulation.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'simulation',
      VITE_SENTRY_DSN: '',
      VITE_AZURE_TENANT_ID: '',
      VITE_AZURE_CLIENT_ID: '',
      VITE_CLIENT_LANGUAGE: 'fr',
      VITE_RESOURCE_MODE: 'prod', // les tests des modes choisissent le leur sur l'appareil
      VITE_CACHE_DIR: 'node_modules/.vite-simulation',
    },
  },
};
