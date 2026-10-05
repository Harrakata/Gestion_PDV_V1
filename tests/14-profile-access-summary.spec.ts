import { test, expect } from '@playwright/test';

const fixture = '/tests/fixtures/profile-access-summary.html';

test('each menu shows its own read or write level, including nested menus', async ({ page }) => {
  await page.goto(fixture);
  const row = page.getByRole('row').filter({ hasText: 'Profil mixte' });
  await row.getByRole('button', { name: /Voir les accès/ }).click();
  for (const [label, level] of [['Maintenance Terminaux', 'Écriture'], ['Réparation', 'Lecture'], ['Atelier', 'Écriture']]) {
    const item = row.getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
    await expect(item.getByText(level, { exact: true })).toBeVisible();
  }
  await expect(row.getByRole('listitem')).toHaveCount(3);
  await expect(row.getByRole('list').getByText('Agences', { exact: true })).toHaveCount(0);
  await expect(row.getByText('Lecture : 1')).toBeVisible();
  await expect(row.getByText('Écriture : 2')).toBeVisible();
  const readOnly = page.getByRole('row').filter({ hasText: 'Profil B' });
  await readOnly.getByRole('button').click();
  await expect(readOnly.getByRole('list').getByText('Écriture', { exact: true })).toHaveCount(0);
  await expect(readOnly.getByRole('listitem').first().getByText('Lecture', { exact: true })).toBeVisible();
});

test('access counts remain visible while details expand independently and collapse', async ({ page }) => {
  await page.goto(fixture);
  const first = page.getByRole('row').filter({ hasText: 'Profil A' });
  const second = page.getByRole('row').filter({ hasText: 'Profil B' });
  await expect(first.getByText('Lecture : 0')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Onglets autorisés' })).toHaveCount(0);
  const toggle = first.getByRole('button', { name: /Voir les accès/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const expanded = first.getByRole('button', { name: /Masquer les accès/ });
  await expect(expanded).toHaveAttribute('aria-expanded', 'true');
  await expect(first.getByRole('listitem').first()).toBeVisible();
  await expect(second.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  await expect(first.getByRole('listitem').last()).toBeAttached();
  await expanded.click();
  await expect(first.getByRole('list')).toHaveCount(0);
  await expect(first.getByRole('button')).toBeFocused();
  await expect(page.getByRole('row').filter({ hasText: 'Sans accès' }).getByRole('button')).toHaveCount(0);
  await expect(page.getByText('Aucun onglet autorisé.')).toBeVisible();
});

test('disclosure is keyboard operable and resets when switching spaces', async ({ page }) => {
  await page.goto(fixture);
  const row = page.getByRole('row').filter({ hasText: 'Profil A' });
  await row.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(row.getByRole('list')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(row.getByRole('list')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Changer d’espace' }).click();
  await expect(page.getByRole('list')).toHaveCount(0);
});

test('long permissions lists are bounded and scrollable on desktop and mobile', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport);
    await page.goto(fixture);
    await page.screenshot({ path: testInfo.outputPath(`compact-${viewport.width}.png`) });
    const row = page.getByRole('row').filter({ hasText: 'Profil A' });
    await row.getByRole('button').click();
    const list = row.getByRole('list');
    const dimensions = await list.evaluate((element) => ({ height: element.clientHeight, scroll: element.scrollHeight, width: element.clientWidth, scrollWidth: element.scrollWidth }));
    expect(dimensions.height).toBeLessThanOrEqual(192);
    expect(dimensions.scroll).toBeGreaterThan(dimensions.height);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
    await list.getByRole('listitem').last().scrollIntoViewIfNeeded();
    await expect(list.getByRole('listitem').last()).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`expanded-${viewport.width}.png`) });
  }
});
