import { expect, test } from '@playwright/test';

test('recherche un terminal dans la liste de la modale', async ({ page }) => {
  await page.goto('/tests/fixtures/mobi-terminal-search.html');
  await page.getByRole('combobox').click();
  const search = page.getByPlaceholder('Rechercher un terminal...');
  await search.fill('0002');
  await expect(search).toHaveValue('0002');
  await page.getByRole('option', { name: /TELPO390-0002/ }).click();
  await expect(page.getByLabel('Terminal choisi')).toHaveText('TELPO390-0002');
});
