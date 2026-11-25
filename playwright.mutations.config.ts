import recetteConfig from './playwright.authenticated.config';

// Scénarios qui écrivent en base de recette : CRUD, jeu de test, absences, tickets, remontées.
export default {
  ...recetteConfig,
  testMatch: /[\/](?:04|05|06|08|09|11)-[^\/]+\.spec\.ts$/,
};
