import { expect, test, type Page } from '@playwright/test';

// Barre d'onglets du téléphone. Aucun service client n'est appelé.
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const bar = (page: Page) => page.locator('.mobile-tabbar');
const labels = (page: Page) => bar(page).locator('.mobile-tabbar-label').allTextContents();
const goTo = async (page: Page, name: string) => {
  await bar(page).getByRole('button', { name: /Ouvrir le menu/ }).tap();
  await page.getByRole('navigation', { name: /^Menu/ }).getByRole('button', { name }).tap();
};

test.beforeEach(async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  await page.route('**/*', (route) => (new URL(route.request().url()).origin === localOrigin ? route.continue() : route.abort()));
  await page.goto('/tests/fixtures/space-shell.html?many=1');
  await expect(bar(page)).toBeVisible();
});

test('une page du menu « Plus » prend la dernière place et devient l’onglet actif', async ({ page }) => {
  expect(await labels(page)).toEqual(['Mon planning', 'Mes rapports', 'Maintenance', 'Agenda', 'Plus']);
  for (const [name, short] of [['Suivi Pointage', 'Pointage'], ['Autorisation Paiement Gain', 'Paiements'], ['Direction Générale', 'Direction Générale']]) {
    await goTo(page, name);
    expect(await labels(page)).toEqual(['Mon planning', 'Mes rapports', 'Maintenance', short, 'Plus']);
    const current = bar(page).locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveClass(/is-active/);
    await expect(current).toHaveText(short);
    await expect(bar(page).locator('.is-active')).toHaveCount(1);
    const boxes = await bar(page).getByRole('button').evaluateAll(list => list.map(el => { const r = el.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
    for (const [left, right, width] of boxes) { expect(left).toBeGreaterThanOrEqual(0); expect(right).toBeLessThanOrEqual(360); expect(Math.abs(width - boxes[0][2])).toBeLessThanOrEqual(1); }
  }
});

test('revenir à un raccourci rétablit la barre d’origine', async ({ page }) => {
  await goTo(page, 'Suivi Pointage');
  await bar(page).getByRole('button', { name: 'Mon planning' }).tap();
  expect(await labels(page)).toEqual(['Mon planning', 'Mes rapports', 'Maintenance', 'Agenda', 'Plus']);
  await expect(bar(page).locator('[aria-current="page"]')).toHaveText('Mon planning');
});

test('avec 3 raccourcis, la page ouverte prend la 3e place', async ({ page }) => {
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(entry => entry.name).find(name => name.includes('lib/mobileCustomization.js'))!;
    const module = await import(/* @vite-ignore */ url);
    module.applyMobileCustomization({ tabCount: 3 }, { persist: false });
  });
  await expect(bar(page).getByRole('button')).toHaveCount(4);
  await goTo(page, 'Suivi Pointage');
  expect(await labels(page)).toEqual(['Mon planning', 'Mes rapports', 'Pointage', 'Plus']);
});
