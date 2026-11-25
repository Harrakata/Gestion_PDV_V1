import { test, expect, type Page } from '@playwright/test';
import { EXPLOITATION_ACCESS_LEVELS, EXPLOITATION_MENU_PERMISSIONS } from '../src/lib/exploitationProfiles.js';
import { simulateBackend, type Account, type Row } from './helpers/simulatedBackend';

// Parcours connectés des sept espaces, dans l'application complète (routes, menus, droits),
// sur une base simulée : connexion, chaque menu, déconnexion. Aucun compte réel nécessaire.
const account = (id: string): Account => ({ id: `auth-${id}`, email: `${id}@exemple.test`, password: 'motdepasse-test' });
const { NONE, READ, WRITE } = EXPLOITATION_ACCESS_LEVELS;
const permissions = (levels: Record<string, string>, fallback = NONE) =>
  Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path }) => [path, levels[path] ?? fallback]));

const agences: Row[] = [{ id: 'a1', nom: 'Gombe', region: 'Nord', secteur: 'Secteur 1', codePDV: '001', nbreTerminaux: 2, is_current: true, statut: 'Actif', adresse: 'Avenue 1' }];
const base: Record<string, Row[]> = { agences, regions: [{ id: 'r1', nom: 'Nord' }], secteurs: [{ id: 's1', nom: 'Secteur 1', region: 'Nord', code: 'S1' }] };
const person = (id: string, extra: Row = {}): Row => ({ id: `${id}-1`, nom: 'Diallo', prenom: 'Awa', email: `${id}@exemple.test`, matricule: `M-${id}`, telephone: '0700000000', auth_user_id: `auth-${id}`, is_current: true, statut: 'Actif', ...extra });

type Space = { name: string; id: string; path: string; tables: Record<string, Row[]>; twoSteps?: boolean; minMenus: number };
const SPACES: Space[] = [
  { name: 'Exploitation', id: 'exploitation', path: '/espace-exploitation', tables: { profils_exploitation: [person('exploitation', { permissions: permissions({}, WRITE) })] }, minMenus: 20 },
  { name: "Chef d'agence", id: 'chef', path: '/espace-chef-agence', tables: { chefs_agence: [person('chef', { agenceEnCharge: 'Gombe', codePDV: '001' })] }, twoSteps: true, minMenus: 7 },
  { name: 'Chef de secteur', id: 'secteur', path: '/espace-chef-secteur', tables: { chefs_secteur: [person('secteur', { secteurEnCharge: 'Secteur 1', codeSecteur: 'S1' })] }, minMenus: 4 },
  { name: 'Guichetière', id: 'guichetiere', path: '/espace-guichetiere', tables: { guichetieres: [person('guichetiere', { agenceAssigne: 'Gombe', codePrepose: 'P1' })] }, minMenus: 4 },
  { name: 'Technicien', id: 'technicien', path: '/espace-technicien', tables: { techniciens: [person('technicien', { id: 7 })] }, minMenus: 3 },
  { name: 'Directeur régional', id: 'regional', path: '/espace-validation-paiement-gain', tables: { validateurs_paiement_gain: [person('regional', { fonction: 'Directeur régional', regionAssignee: 'Nord' })] }, minMenus: 1 },
  { name: 'Directeur général', id: 'general', path: '/espace-directeur-general', tables: { validateurs_paiement_gain: [person('general', { fonction: 'Directeur général' })] }, minMenus: 1 },
];

const menuOf = (page: Page) => page.getByRole('navigation', { name: /^Menu · / });
const submit = (page: Page) => page.locator('main form button[type="submit"], form button[type="submit"]').first();

const signIn = async (page: Page, space: Space, password = 'motdepasse-test') => {
  await page.goto(space.path);
  await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(`${space.id}@exemple.test`);
  if (space.twoSteps) await submit(page).click();
  await page.getByLabel(/^Mot de passe/).first().fill(password);
  await submit(page).click();
};

const expectHealthy = async (page: Page, errors: string[], where: string) => {
  await expect(page.getByText('Une erreur est survenue', { exact: false }), where).toHaveCount(0);
  expect(errors, where).toEqual([]);
  await expect(page.locator('.app-space-main'), where).toContainText(/\S/);
};

test.describe('Espaces connectés (base simulée)', () => {
  for (const space of SPACES) {
    test(`${space.name} : connexion, tous les menus, déconnexion`, async ({ page }) => {
      test.setTimeout(180_000);
      const backend = await simulateBackend(page, { accounts: [account(space.id)], tables: { ...base, ...space.tables } });
      await signIn(page, space);
      await expect(menuOf(page)).toBeVisible();
      expect(backend.signIns).toEqual([`${space.id}@exemple.test`]);

      // Chaque destination du menu, dans l'ordre affiché.
      const items = menuOf(page).locator('.space-menu-item:not([aria-disabled="true"]):not(:disabled)');
      const names = (await items.allTextContents()).map(text => text.trim()).filter(Boolean);
      expect(names.length).toBeGreaterThanOrEqual(space.minMenus);
      for (const name of names) {
        await items.filter({ hasText: name }).first().click();
        await backend.settle();
        await expectHealthy(page, backend.errors, `${space.name} / ${name}`);
      }
      // Parcourir les menus ne modifie aucune donnée.
      expect(backend.writes().map(write => `${write.method} ${write.table}`)).toEqual([]);

      await page.getByRole('button', { name: 'Déconnexion' }).first().click();
      await expect(menuOf(page)).toHaveCount(0);
      await page.goto(space.path);
      await expect(page.getByRole('textbox', { name: /^(Email|Identifiant)/ })).toBeVisible();
    });

    test(`${space.name} : mot de passe refusé`, async ({ page }) => {
      const backend = await simulateBackend(page, { accounts: [account(space.id)], tables: { ...base, ...space.tables } });
      await signIn(page, space, 'mauvais-mot-de-passe');
      await expect(page.locator('[role="status"], [data-state="open"], li').filter({ hasText: /incorrect/i }).first()).toBeVisible();
      await expect(menuOf(page)).toHaveCount(0);
      expect(backend.signIns).toEqual([]);
      expect(backend.errors).toEqual([]);
    });

    test(`${space.name} : un compte d'un autre espace est refusé`, async ({ page }) => {
      // Le compte existe, mais aucune fiche de cet espace ne lui est liée.
      const tables = Object.fromEntries(Object.entries(space.tables).map(([name, rows]) => [name, rows.map(row => ({ ...row, auth_user_id: 'auth-autre', email: 'autre@exemple.test', matricule: 'M-autre' }))]));
      const backend = await simulateBackend(page, { accounts: [account(space.id)], tables: { ...base, ...tables } });
      await page.goto(space.path);
      await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(`${space.id}@exemple.test`);
      await submit(page).click();
      if (!space.twoSteps) {
        await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
        await submit(page).click();
      }
      await expect(page.getByText(/aucun profil|aucune fiche|accès refusé|inconnu/i).first()).toBeVisible();
      await expect(menuOf(page)).toHaveCount(0);
      expect(backend.errors).toEqual([]);
    });
  }
});

test.describe('Connexion chef d’agence : mot de passe obligatoire', () => {
  const chef = SPACES[1];
  const withPhoto = { ...base, chefs_agence: [person('chef', { agenceEnCharge: 'Gombe', codePDV: '001', photo_url: 'https://simulation.supabase.co/storage/v1/object/public/b/photo.jpg' })] };
  const remembered = { isAuthenticated: true, chefInfo: { id: 'chef-1', matricule: 'M-chef', nomChef: 'Awa Diallo', nomAgence: 'Gombe', codePDV: '001' } };

  test('une fiche avec photo ne propose plus la reconnaissance faciale', async ({ page }) => {
    const backend = await simulateBackend(page, { accounts: [account('chef')], tables: withPhoto });
    await page.goto(chef.path);
    await page.getByRole('textbox', { name: /^Identifiant/ }).fill('M-chef');
    await submit(page).click();
    await expect(page.getByLabel(/^Mot de passe/).first()).toBeVisible();
    await expect(page.getByText(/reconnaissance faciale|visage|prendre une photo/i)).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: 'Progression de la connexion' })).toHaveAttribute('aria-valuemax', '2');
    await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
    await submit(page).click();
    await expect(menuOf(page)).toBeVisible();
    expect(backend.signIns).toEqual(['chef@exemple.test']);
    // La session vérifiée survit à un rechargement, aussi sur la page de paiement.
    await page.reload();
    await expect(menuOf(page)).toBeVisible();
    await page.goto('/paiement-gros-gain');
    await backend.settle();
    await expect(page.getByText('Accéder à l’espace Chef d’agence').or(page.getByText("Accéder à l'espace Chef d'agence"))).toHaveCount(0);
    expect(backend.errors).toEqual([]);
  });

  test('une connexion mémorisée sans mot de passe vérifié est refusée et effacée', async ({ page }) => {
    const backend = await simulateBackend(page, { accounts: [account('chef')], tables: withPhoto });
    await page.goto('/');
    for (const path of [chef.path, '/paiement-gros-gain']) {
      await page.evaluate(value => localStorage.setItem('pmuChefAuth', value), JSON.stringify(remembered));
      await page.goto(path);
      await backend.settle();
      await expect(menuOf(page)).toHaveCount(0);
      expect(await page.evaluate(() => localStorage.getItem('pmuChefAuth')), path).toBeNull();
    }
    await expect(page.getByText(/Accéder à l.espace Chef d.agence/)).toBeVisible();
    await page.goto(chef.path);
    await expect(page.getByRole('textbox', { name: /^Identifiant/ })).toBeVisible();
    expect(backend.allWrites.filter(write => write.table === 'connexions_chefs')).toEqual([]);
    expect(backend.errors).toEqual([]);
  });

  test('connexion instable et jeton expiré : la session vérifiée reste utilisable', async ({ page }) => {
    const backend = await simulateBackend(page, { accounts: [account('chef')], tables: withPhoto });
    await signIn(page, chef);
    await expect(menuOf(page)).toBeVisible();
    await backend.settle();
    // Jeton périmé sur l'appareil, renouvellement impossible faute de réseau.
    await page.evaluate(() => {
      const key = 'pmu-supabase-auth-chef-agence';
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), expires_at: Math.floor(Date.now() / 1000) - 60 }));
    });
    await page.route(/auth.v1.token/, route => route.abort('internetdisconnected'));
    await page.reload();
    await expect(menuOf(page)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('pmuChefAuth'))).toContain('Awa Diallo');
  });

  test('session révoquée côté serveur : le mot de passe est redemandé', async ({ page }) => {
    const backend = await simulateBackend(page, { accounts: [account('chef')], tables: withPhoto });
    await signIn(page, chef);
    await expect(menuOf(page)).toBeVisible();
    await backend.settle();
    await page.evaluate(() => {
      const key = 'pmu-supabase-auth-chef-agence';
      localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), expires_at: Math.floor(Date.now() / 1000) - 60 }));
    });
    await page.route(/auth.v1.token/, route => route.fulfill({ status: 400, json: { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' } }));
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('pmu-supabase-auth-chef-agence'))).toBeNull();
    await page.goto(chef.path);
    await expect(page.getByRole('textbox', { name: /^Identifiant/ })).toBeVisible();
    await expect(menuOf(page)).toHaveCount(0);
  });
});

test.describe('Accès complet de mise en service (Exploitation)', () => {
  const exploitation = SPACES[0];
  const start = async (page: Page, tables: Record<string, Row[]>, fail?: (method: string, url: string) => boolean) => {
    const backend = await simulateBackend(page, { accounts: [account('exploitation')], tables: { ...base, ...tables } });
    if (fail) await page.route(/rest.v1.profils_exploitation/, route => (fail(route.request().method(), route.request().url()) ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'panne simulée' } }) : route.fallback()));
    await signIn(page, exploitation);
    return backend;
  };

  test('accordé seulement si la base confirme qu’aucun profil n’existe', async ({ page }) => {
    await start(page, { profils_exploitation: [] });
    await expect(page.getByText('Mode bootstrap').first()).toBeVisible();
    await expect(menuOf(page)).toBeVisible();
  });

  test('refusé si le comptage des profils échoue', async ({ page }) => {
    await start(page, { profils_exploitation: [] }, method => method === 'HEAD');
    await expect(page.getByText('Vérification impossible').first()).toBeVisible();
    await expect(page.getByText('Mode bootstrap')).toHaveCount(0);
    await expect(menuOf(page)).toHaveCount(0);
    expect(await page.evaluate(() => [localStorage.getItem('pmuExploitationAuth'), localStorage.getItem('pmu-supabase-auth-exploitation')])).toEqual([null, null]);
  });

  test('refusé si le profil ne peut pas être lu', async ({ page }) => {
    await start(page, { profils_exploitation: [] }, method => method === 'GET');
    await expect(page.getByText('Erreur chargement profil').first()).toBeVisible();
    await expect(page.getByText('Mode bootstrap')).toHaveCount(0);
    await expect(menuOf(page)).toHaveCount(0);
  });

  test('refusé à un compte sans profil quand des profils existent', async ({ page }) => {
    await start(page, { profils_exploitation: [person('exploitation', { auth_user_id: 'auth-autre' })] });
    await expect(page.getByText('Aucun profil Exploitation associé').first()).toBeVisible();
    await expect(menuOf(page)).toHaveCount(0);
  });
});

test.describe('Droits Exploitation (base simulée)', () => {
  const exploitation = SPACES[0];
  const open = async (page: Page, profile: Row) => {
    const backend = await simulateBackend(page, { accounts: [account('exploitation')], tables: { ...base, profils_exploitation: [person('exploitation', profile)] } });
    await signIn(page, exploitation);
    return backend;
  };

  test('seuls les menus autorisés sont proposés, une adresse interdite ne s’ouvre pas', async ({ page }) => {
    const backend = await open(page, { permissions: permissions({ agences: READ, guichetieres: WRITE }) });
    await expect(menuOf(page)).toBeVisible();
    const names = (await menuOf(page).locator('.space-menu-item').allTextContents()).map(text => text.trim());
    expect(names.sort()).toEqual(['Agences', 'Guichetières']);
    await page.goto('/espace-exploitation/parametres');
    await backend.settle();
    await expect(page.getByRole('heading', { name: 'Paramètres', exact: true })).toHaveCount(0);
  });

  test('lecture seule : pas d’ajout ; écriture : ajout possible', async ({ page }) => {
    const backend = await open(page, { permissions: permissions({ agences: READ, guichetieres: WRITE }) });
    await expect(menuOf(page)).toBeVisible();
    await menuOf(page).getByText('Agences', { exact: true }).click();
    await expect(page.getByText('Gombe').first()).toBeVisible();
    const addBranch = page.getByRole('button', { name: /Ajouter une Agence/i });
    if (await addBranch.count()) await expect(addBranch.first()).toBeDisabled();
    await menuOf(page).getByText('Guichetières', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Ajouter une Guichetière/i }).first()).toBeEnabled();
    expect(backend.writes()).toEqual([]);
  });

  test('un profil inactif ne peut pas se connecter', async ({ page }) => {
    await open(page, { statut: 'Inactif', permissions: permissions({}, WRITE) });
    await expect(page.getByText('Aucun profil Exploitation associé').first()).toBeVisible();
    await expect(menuOf(page)).toHaveCount(0);
  });

  test('un profil sans aucun droit ne peut pas se connecter', async ({ page }) => {
    await open(page, { permissions: permissions({}) });
    await expect(page.getByText('Aucun accès disponible').first()).toBeVisible();
    await expect(menuOf(page)).toHaveCount(0);
  });
});
