import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/salary-assistant.html');
});

test('searches across fields and updates the selected totals and detail', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Rechercher un préposé' }).fill('MELANIE lukunga');
  await expect(page.getByText('1 dossier(s) retenu(s) sur 66')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir le préposé 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calcul du préposé 1', exact: true }).click();
  await expect(page.getByText('Dernier versement : 03/05/2026', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir le préposé 1', exact: true }).click();
  await expect(page.getByLabel('Destination')).toHaveText('1 / 2026-05');
});

test('supports cross-filters, validation and resetting', async ({ page }) => {
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  await page.getByRole('combobox', { name: 'Identification', exact: true }).click();
  await page.getByRole('option', { name: 'Identifiés', exact: true }).click();
  await expect(page.getByText('1 dossier(s) retenu(s) sur 66')).toBeVisible();
  await page.getByLabel('Écart minimum').fill('6000');
  await page.getByLabel('Écart maximum').fill('5000');
  await expect(page.getByRole('alert')).toContainText('minimum');
  await expect(page.getByRole('button', { name: 'Exporter les résultats' })).toBeDisabled();
  await page.getByRole('button', { name: 'Réinitialiser les filtres', exact: true }).first().click();
  await expect(page.getByText('66 dossier(s) retenu(s) sur 66')).toBeVisible();
});

test('all results remain available across pages and in exports', async ({ page }) => {
  await expect(page.getByText('1–25 sur 66', { exact: true })).toBeVisible();
  await page.getByLabel('Résultats du rapprochement').evaluate((element) => { element.scrollTop = 200; });
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(page.getByText('26–50 sur 66', { exact: true })).toBeVisible();
  await expect.poll(() => page.getByLabel('Résultats du rapprochement').evaluate((element) => element.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Page suivante' }).click();
  await expect(page.getByText('51–66 sur 66', { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter les résultats' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8').trim().split('\n')).toHaveLength(67);
});

test('does not display stale totals or enable exports while loading or on error', async ({ page }) => {
  for (const state of ['loading', 'error']) {
    await page.goto(`/tests/fixtures/salary-assistant.html?${state}`);
    await expect(page.getByRole('button', { name: 'Exporter les résultats' })).toBeDisabled();
    await expect(page.getByLabel('Totaux des résultats filtrés')).toHaveCount(0);
  }
});

test('filters and rows fit narrow and wide viewports', async ({ page }, testInfo) => {
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: /^Filtres/ }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow, `Overflow at ${width}px`).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`salary-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /^Filtres/ }).click();
  }
});

test('keeps the period selector compact on wide screens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const periodBox = await page.getByLabel('Période de rapprochement').boundingBox();
  const searchBox = await page.getByRole('searchbox', { name: 'Rechercher un préposé' }).boundingBox();
  const filterButton = await page.getByRole('button', { name: /^Filtres/ }).boundingBox();

  expect(periodBox?.width).toBeLessThanOrEqual(210);
  expect(searchBox?.width).toBeGreaterThan(periodBox?.width ?? 0);
  expect(Math.abs((filterButton?.y ?? 0) - (periodBox?.y ?? 0))).toBeLessThanOrEqual(8);
});
