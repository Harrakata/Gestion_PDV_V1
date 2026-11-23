import { test, expect } from '@playwright/test';
import { assertNoCrash, settle } from './helpers/actions';

// ════════════════════════════════════════════════════════════════════════════
//  Smoke public : ce qui est accessible sans authentification.
//  Vérifie le chargement, l'en-tête, le menu « Espaces » et la non-régression
//  globale (pas d'ErrorBoundary).
// ════════════════════════════════════════════════════════════════════════════

test.describe('Accueil & navigation publique', () => {
  test("l'application se charge sans crash", async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await expect(page).toHaveTitle(/.+/);
    await assertNoCrash(page);
  });

  test("l'en-tête affiche les accès principaux", async ({ page }) => {
    await page.goto('/');
    await settle(page);
    // Liens d'en-tête vus dans Layout (selon fonctionnalités activées).
    await expect(page.getByText(/Page d'Accueil|Accueil/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /espaces/i }).first()).toBeVisible();
    await assertNoCrash(page);
  });

  test('le menu « Espaces » liste les espaces disponibles', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    await page.getByRole('button', { name: /espaces/i }).first().click();
    await page.waitForTimeout(400);
    // Au moins l'Espace Exploitation est toujours présent.
    await expect(page.getByText(/Espace Exploitation/i).first()).toBeVisible();
    await assertNoCrash(page);
  });

  test('la navigation reste accessible sans fil d’Ariane ni menu de recherche', async ({ page }) => {
    await page.goto('/espace-exploitation');
    await settle(page);
    await expect(page.getByRole('navigation', { name: /fil d’ariane/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /navigation rapide|rechercher dans la navigation|recherche globale/i })).toHaveCount(0);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /navigation rapide|rechercher dans la navigation|recherche globale/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Espace Exploitation', exact: true })).toBeVisible();
    await assertNoCrash(page);
  });

  test('les formulaires d’accès partagent les mêmes repères accessibles', async ({ page }) => {
    await page.goto('/espace-exploitation');
    await settle(page);
    await expect(page.getByLabel(/^Email/)).toBeVisible();
    await expect(page.getByLabel(/^Mot de passe/)).toBeVisible();
    await expect(page.getByRole('button', { name: /afficher le mot de passe/i })).toBeVisible();
    await assertNoCrash(page);
  });

  test('le thème enregistré (couleur + mode sombre) s’applique sans bouton de bascule', async ({ page }) => {
    // Réglage propre au test : la base n'est ni lue ni écrite.
    await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
    await page.addInitScript(() => localStorage.setItem(
      'app_theme_cache', JSON.stringify({ primaryHsl: '217 91% 60%', darkMode: true }),
    ));
    await page.goto('/');
    await settle(page);
    await assertNoCrash(page);
    await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
    const token = (name: string) => page.evaluate(
      key => getComputedStyle(document.documentElement).getPropertyValue(key).trim(), name,
    );
    expect(await token('--primary')).toMatch(/^217 /);
    expect(await token('--accent-foreground')).toMatch(/^217 /);
    await expect(page.getByRole('button', { name: /th[eè]me/i })).toHaveCount(0);
  });

  test('chaque route d’espace répond (login ou contenu, sans crash)', async ({ page }) => {
    const routes = [
      '/espace-exploitation',
      '/espace-chef-agence',
      '/espace-guichetiere',
      '/espace-chef-secteur',
      '/espace-technicien',
      '/espace-validation-paiement-gain',
      '/espace-directeur-general',
      '/pointage',
    ];
    for (const route of routes) {
      await page.goto(route);
      await settle(page, 600);
      await assertNoCrash(page);
    }
  });
});
