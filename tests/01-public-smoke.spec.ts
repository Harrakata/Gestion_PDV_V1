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

  test('le basculement de thème ne casse pas la page', async ({ page }) => {
    await page.goto('/');
    await settle(page);
    // Bouton de thème (icône lune/soleil) — sélection tolérante.
    const themeBtn = page.locator('header button').last();
    await themeBtn.click().catch(() => {});
    await page.waitForTimeout(300);
    await assertNoCrash(page);
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
