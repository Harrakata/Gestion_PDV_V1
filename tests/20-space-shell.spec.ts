import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  // Cette fixture ne doit jamais accéder aux services d'un client.
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === localOrigin) return route.continue();
    return route.abort();
  });
  await page.goto('/tests/fixtures/space-shell.html');
});

test('le bureau aligne la marque et le menu dans une seule carte', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.locator('.space-sidebar-card');
  const topBar = page.locator('.app-top-header > div');
  await expect(page.getByRole('heading', { name: 'Mon planning', level: 1 })).toBeVisible();
  await expect(sidebar).toHaveCount(1);
  await expect(sidebar.getByText('Espace Guichetière')).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Profil' })).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  const cardRect = (await sidebar.boundingBox())!;
  const barRect = (await topBar.boundingBox())!;
  expect(Math.abs(cardRect.y - barRect.y)).toBeLessThan(2);
  expect(cardRect.x + cardRect.width).toBeLessThan(barRect.x);
});

test('la recherche masque les destinations désactivées et le menu reste actif après une erreur', async ({ page }) => {
  const search = page.getByRole('combobox', { name: 'Rechercher dans l’espace' });
  await search.fill('maintenance');
  await expect(page.getByText('Aucun résultat.')).toBeVisible();
  await search.fill('rapports');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'Une erreur est survenue' })).toBeVisible();
  const menu = page.getByRole('navigation', { name: /Menu · Espace Guichetière/ });
  await expect(menu.getByRole('button', { name: 'Mes rapports' })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('button', { name: 'Mon planning' }).click();
  await expect(page.getByRole('heading', { name: 'Mon planning', level: 1 })).toBeVisible();
  await search.fill('agenda');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
});

test('le tiroir mobile ouvre le même menu et se referme après une sélection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.getByRole('button', { name: 'Ouvrir le menu de l’espace' });
  const menu = page.getByRole('navigation', { name: /Menu · Espace Guichetière/ });
  await expect(menu).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('button', { name: 'Maintenance' })).toBeDisabled();
  await menu.getByRole('button', { name: 'Mon planning' }).click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();
  await expect(page.locator('.app-space-mobile-header').getByText('Profil test')).toBeVisible();
  await expect(page.locator('.app-top-header').getByText('Profil test')).toBeHidden();
});
