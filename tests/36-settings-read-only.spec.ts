import { test, expect, type Locator, type Page } from '@playwright/test';
import { EXPLOITATION_ACCESS_LEVELS, EXPLOITATION_MENU_PERMISSIONS } from '../src/lib/exploitationProfiles.js';
import { simulateBackend, type Row } from './helpers/simulatedBackend';

// Écran Paramètres : un profil en lecture seule consulte tout et ne modifie rien ; un profil en
// écriture garde toutes ses actions.
const write = Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path }: any) => [path, EXPLOITATION_ACCESS_LEVELS.WRITE]));
const term = { type: 'ccope', key: 'mt_enr', operator: null, coeff: 1 };
const tables: Record<string, Row[]> = {
  agences: [{ id: 'a1', nom: 'Gombe', region: 'Nord', is_current: true }],
  chefs_agence: [{ id: 12, nom: 'Traoré', prenom: 'Issa', matricule: 'C1', is_current: true }],
  app_settings: [
    { id: 1, key: 'general', value: { creneauxPointage: [{ debut: '08:00', fin: '09:00' }, { debut: '14:00', fin: '15:00' }], rappelActif: true, sessionDureeMinutes: 60 } },
    { id: 2, key: 'salaire_guichetiere_config', value: { penalite_type: 'fixe', penalite_montant_fixe: 500, formula_terms: [term], prime_formula_terms: [term], reliquat_formula_terms: [term] } },
    { id: 3, key: 'custom_salary_formulas', value: [{ id: '77', name: 'Transport', terms: [term] }] },
    { id: 4, key: 'powerbi_ccope_url', value: { iframeUrl: 'https://app.powerbi.com/reportEmbed?reportId=1', webUrl: 'https://app.powerbi.com/x', showWebButton: true } },
    { id: 5, key: 'activity_purge_status', value: { scheduled: true } },
  ],
  salaire_config_historique: [{ id: 'h1', type: 'salaire', formula_terms: [term], penalite_config: null, date_debut: '2026-01-01', date_fin: null, is_current: true, created_at: '2026-01-01T00:00:00Z' }],
};
const open = async (page: Page, level: string) => {
  const profile = { id: 'exploitation-1', nom: 'Diallo', prenom: 'Awa', email: 'exploitation@exemple.test', auth_user_id: 'auth-exploitation', statut: 'Actif', permissions: { ...write, parametres: level } };
  const backend = await simulateBackend(page, { accounts: [{ id: 'auth-exploitation', email: profile.email, password: 'motdepasse-test' }], tables: { ...tables, profils_exploitation: [profile] } });
  await page.goto('/espace-exploitation/parametres');
  await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(profile.email);
  await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
  await page.locator('main form button[type="submit"], form button[type="submit"]').first().click();
  await expect(page.getByRole('heading', { name: 'Paramètres', exact: true })).toBeVisible();
  await backend.settle();
  return backend;
};

const SECTIONS = [/^Pointage/, /^Paramètre Formule/, /^Rapports Power BI/, /^Langue/, /^Mode de ressources/, /^Personnalisation —/, /^Personnalisation App Mobile/];
const FORMULAS = [/^Salaire Guichetière/, /^Rélicat Différence/, /^Prime Formule/, /^Pénalité/, /^Prélèvements/, /^Transport/];
const main = (page: Page) => page.locator('.app-space-main');
const openAll = async (page: Page) => {
  for (const name of SECTIONS) await main(page).getByRole('button', { name }).first().click();
  for (const name of FORMULAS) await main(page).getByRole('button', { name }).first().click();
  await expect(main(page).getByText('Conservation', { exact: true })).toBeVisible();
};
const SAVE = /^(Enregistrer|Valider|Ajouter|Importer|Valeurs par défaut|Supprimer la formule|Supprimer le créneau|Activer la purge)/;

test.describe('Profil en lecture seule', () => {
  test('tout est consultable, aucun champ ni action de modification', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.READ);
    await expect(page.getByText('Cet onglet est ouvert en lecture seule')).toBeVisible();
    await openAll(page);

    for (const value of ['Salaire Guichetière', 'Transport', 'Traoré']) await expect(main(page).getByText(value, { exact: false }).first()).toBeVisible();
    await expect(main(page).getByRole('button', { name: SAVE, disabled: false })).toHaveCount(0);
    for (const name of [/^Enregistrer/, /^Valider/, /^Ajouter (Formule|un créneau)/, /^Importer/, /^Supprimer (la formule|le créneau)/]) await expect(main(page).getByRole('button', { name })).toHaveCount(0);

    // Seuls restent actifs : ouvrir une section, l'historique, l'export, et les choix personnels.
    const active = await main(page).locator('input:enabled, select:enabled, textarea:enabled, button:enabled, [contenteditable="true"]').evaluateAll(list => list.map(element => (
      element.closest('[role="radiogroup"]')?.getAttribute('aria-label') || element.getAttribute('aria-label') || (element.textContent || '').trim().slice(0, 40) || element.outerHTML.slice(0, 80)
    )));
    const allowed = [/^Historique/, /^Exporter/, /^Langue sur cet appareil/, /^Mode sur cet appareil/, ...SECTIONS.map(name => new RegExp(name.source.replace(' —', '')))];
    expect(active.filter(label => !allowed.some(pattern => pattern.test(label)))).toEqual([]);
    expect(backend.writes()).toEqual([]);
    expect(backend.errors).toEqual([]);
  });

  test('forcer un clic ou une saisie ne change rien', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.READ);
    await openAll(page);
    const theme = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'));
    const click = (target: Locator) => target.click({ force: true, timeout: 2000 }).catch(() => {});
    await click(main(page).getByRole('switch', { name: 'Rappels sonores' }));
    await click(main(page).getByRole('switch', { name: 'Tableaux rayés' }));
    await click(main(page).getByRole('radio', { name: 'Vert', exact: true }).first());
    await click(main(page).getByRole('radiogroup', { name: "Langue de l'application" }).getByRole('radio', { name: 'English' }));
    await click(main(page).locator('[role="combobox"]:disabled').first());
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(main(page).getByText('Non enregistré')).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary'))).toBe(theme);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
    expect(backend.writes()).toEqual([]);
  });

  test('historique consultable, dates non modifiables', async ({ page }) => {
    await open(page, EXPLOITATION_ACCESS_LEVELS.READ);
    await openAll(page);
    await main(page).getByRole('button', { name: 'Historique' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('COURANT')).toBeVisible();
    await expect(dialog.getByTitle('Modifier les dates')).toHaveCount(0);
  });

  test('la langue et le mode de cet appareil restent au choix', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.READ);
    await main(page).getByRole('button', { name: /^Langue/ }).first().click();
    await main(page).getByRole('radiogroup', { name: 'Langue sur cet appareil' }).getByRole('radio', { name: 'English' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
    expect(backend.writes()).toEqual([]);
  });
});

test.describe('Profil en écriture', () => {
  test('toutes les actions restent présentes et actives', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await openAll(page);
    for (const name of ['Enregistrer les paramètres de pointage', 'Valider la formule Salaire', 'Valider la formule Rélicat', 'Valider la formule Prime', 'Valider la Pénalité', 'Valider la formule Prélèvements', 'Valider Transport', 'Enregistrer les liens', 'Ajouter un créneau', 'Ajouter Formule', 'Supprimer la formule Transport']) {
      await expect(main(page).getByRole('button', { name, exact: true }), name).toBeEnabled();
    }
    for (const name of ['Enregistrer la langue', 'Enregistrer le mode', 'Importer', 'Valeurs par défaut']) expect(await main(page).getByRole('button', { name }).count(), name).toBeGreaterThanOrEqual(name === 'Enregistrer le mode' ? 0 : 1);
    expect(await main(page).locator('fieldset:disabled').count()).toBe(0);
    expect(backend.errors).toEqual([]);
  });

  test('enregistrer le pointage et une formule écrit en base', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await openAll(page);
    await main(page).getByLabel('Durée de session en minutes').fill('45');
    await main(page).getByRole('button', { name: 'Enregistrer les paramètres de pointage' }).click();
    await expect.poll(() => backend.writes().find(item => item.table === 'app_settings')?.body?.value?.sessionDureeMinutes).toBe(45);
    await main(page).getByRole('button', { name: 'Valider la formule Salaire' }).click();
    await expect.poll(() => backend.writes().some(item => item.table === 'salaire_config_historique' && item.method === 'POST')).toBe(true);
  });

  test('enregistrer une formule personnalisée conserve celles déjà en base', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await main(page).getByRole('button', { name: /^Paramètre Formule/ }).first().click();
    await main(page).getByRole('button', { name: 'Ajouter Formule', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Nom de la formule').fill('Panier');
    await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click();
    await main(page).getByRole('button', { name: 'Valider Panier', exact: true }).click();
    const saved = () => backend.writes().filter(item => item.table === 'app_settings').map(item => item.body.value);
    await expect.poll(() => saved().length).toBe(1);
    expect(saved()[0].map((formula: Row) => formula.name)).toEqual(['Transport', 'Panier']);
    expect(saved()[0][0].terms).toEqual([term]);
  });

  test('supprimer une formule enregistrée demande confirmation', async ({ page }) => {
    const backend = await open(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await main(page).getByRole('button', { name: /^Paramètre Formule/ }).first().click();
    await main(page).getByRole('button', { name: 'Supprimer la formule Transport', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
    await expect(main(page).getByText('Transport', { exact: true })).toBeVisible();
    expect(backend.writes()).toEqual([]);
    await main(page).getByRole('button', { name: 'Supprimer la formule Transport', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(main(page).getByText('Transport', { exact: true })).toHaveCount(0);
    expect(backend.writes().map(item => item.body)).toEqual([{ value: [] }]);
  });

  test('la mise en page ne change pas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await openAll(page);
    // Un groupe de champs ne doit ni déborder ni porter la bordure native du navigateur.
    const problems = await main(page).locator('fieldset').evaluateAll(list => list.filter(element => {
      const style = getComputedStyle(element);
      return style.borderLeftWidth !== '0px' || style.marginLeft !== '0px' || element.scrollWidth > element.clientWidth + 1;
    }).length);
    expect(problems).toBe(0);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('Créer une formule depuis l’écran des salaires', () => {
  const people: Record<string, Row[]> = {
    guichetieres: [{ id: 'g1', nom: 'Diallo', prenom: 'Awa', email: 'guichetiere@exemple.test', matricule: 'M1', codePrepose: 'P1', agenceAssigne: 'Gombe', auth_user_id: 'auth-guichetiere', is_current: true, statut: 'Actif' }],
    chefs_agence: [{ id: 12, nom: 'Traoré', prenom: 'Issa', email: 'chef@exemple.test', matricule: 'C1', agenceEnCharge: 'Gombe', codePDV: '001', auth_user_id: 'auth-chef', is_current: true, statut: 'Actif' }],
  };
  const connect = async (page: Page, id: string, path: string, extra: Record<string, Row[]> = {}) => {
    const backend = await simulateBackend(page, { accounts: [{ id: `auth-${id}`, email: `${id}@exemple.test`, password: 'motdepasse-test' }], tables: { ...tables, ...people, agences: [{ id: 'a1', nom: 'Gombe', region: 'Nord', codePDV: '001', is_current: true }], ...extra } });
    await page.goto(path);
    await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(`${id}@exemple.test`);
    const submit = page.locator('main form button[type="submit"], form button[type="submit"]').first();
    if (id === 'chef') await submit.click();
    await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
    await submit.click();
    await expect(page.getByRole('navigation', { name: /^Menu · / })).toBeVisible();
    await backend.settle();
    return backend;
  };
  const formulaMenu = async (page: Page) => {
    await page.getByRole('button', { name: 'Colonnes affichées' }).first().click();
    await expect(page.getByText('Transport', { exact: true }).first()).toBeVisible(); // formules consultables
    return page.getByRole('button', { name: 'Ajouter', exact: true });
  };
  const salaryOf = async (page: Page, level: string) => {
    const profile = { id: 'exploitation-1', nom: 'Diallo', prenom: 'Awa', email: 'exploitation@exemple.test', auth_user_id: 'auth-exploitation', statut: 'Actif', permissions: { ...write, 'chiffres-daffaires': level } };
    const backend = await connect(page, 'exploitation', '/espace-exploitation/chiffres-daffaires', { profils_exploitation: [profile] });
    await page.getByRole('button', { name: /Vue mensuelle/ }).first().click();
    await backend.settle();
    return backend;
  };

  test('Exploitation en écriture : la formule s’ajoute à celles en base', async ({ page }) => {
    const backend = await salaryOf(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await (await formulaMenu(page)).click();
    await page.getByRole('dialog').getByLabel('Nom de la colonne').fill('Panier');
    await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click();
    await expect.poll(() => backend.writes().filter(item => item.table === 'app_settings').map(item => item.body.value.map((formula: Row) => formula.name))).toEqual([['Transport', 'Panier']]);
  });

  test('Exploitation en lecture seule : pas d’ajout', async ({ page }) => {
    await salaryOf(page, EXPLOITATION_ACCESS_LEVELS.READ);
    await expect(await formulaMenu(page)).toHaveCount(0);
  });

  test('guichetière : pas d’ajout', async ({ page }) => {
    const backend = await connect(page, 'guichetiere', '/espace-guichetiere');
    await page.getByRole('navigation', { name: /^Menu · / }).getByText('État de Caisse', { exact: true }).click();
    await backend.settle();
    await expect(await formulaMenu(page)).toHaveCount(0);
  });

  test('chef d’agence : pas d’ajout', async ({ page }) => {
    const backend = await connect(page, 'chef', '/espace-chef-agence');
    await page.getByRole('navigation', { name: /^Menu · / }).getByText('Mes Guichetières', { exact: true }).click();
    await page.getByRole('tab', { name: /Salaire|Caisse|mensuel/i }).first().click();
    await backend.settle();
    await expect(await formulaMenu(page)).toHaveCount(0);
  });
});

test.describe('Contrôle présence (GPS)', () => {
  const openGps = async (page: Page, level: string) => {
    const profile = { id: 'exploitation-1', nom: 'Diallo', prenom: 'Awa', email: 'exploitation@exemple.test', auth_user_id: 'auth-exploitation', statut: 'Actif', permissions: { ...write, 'controle-presence': level } };
    const backend = await simulateBackend(page, {
      accounts: [{ id: 'auth-exploitation', email: profile.email, password: 'motdepasse-test' }],
      tables: {
        ...tables, profils_exploitation: [profile],
        guichetieres: [{ matricule: 'M1', nom: 'Keita', prenom: 'Fanta', is_current: true }],
        pointages: [{ id: 5, guichetiereMatricule: 'M1', agence: 'Gombe', date: '2026-11-24', time: '2026-11-24T08:00:00Z', geo_distance_m: 900, geo_verified: false, geo_refused: false, latitude: 1.5, longitude: 2.5 }],
      },
    });
    await page.goto('/espace-exploitation/controle-presence');
    await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(profile.email);
    await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
    await page.locator('main form button[type="submit"], form button[type="submit"]').first().click();
    await expect(page.getByText('Fanta Keita').first()).toBeVisible();
    return backend;
  };

  test('lecture seule : écart visible, refus impossible', async ({ page }) => {
    const backend = await openGps(page, EXPLOITATION_ACCESS_LEVELS.READ);
    await expect(page.getByText('Hors zone', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Voir/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refuser' })).toHaveCount(0);
    expect(backend.writes()).toEqual([]);
  });

  test('écriture : le refus est enregistré', async ({ page }) => {
    const backend = await openGps(page, EXPLOITATION_ACCESS_LEVELS.WRITE);
    await page.getByRole('button', { name: 'Refuser' }).first().click();
    await page.getByRole('button', { name: 'Refuser et annuler' }).click();
    await expect.poll(() => backend.writes().map(item => [item.table, item.body.geo_refused])).toEqual([['pointages', true]]);
  });
});
