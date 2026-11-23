import { test, expect } from '@playwright/test';

for (const width of [360, 1440]) {
  test.describe(`Formulaires à ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const config of [
      { screen: 'regions', title: 'Ajouter une Région', first: 'Code région', invalid: 2 },
      { screen: 'secteurs', title: 'Ajouter un Secteur', first: 'Nom du secteur', invalid: 2 },
      { screen: 'agences', title: 'Ajouter une Agence', first: "Nom de l'agence", invalid: 4 },
      { screen: 'techniciens', title: 'Ajouter un Technicien', first: 'Matricule', invalid: 5 },
      { screen: 'guichetieres', title: 'Ajouter une Guichetière', first: 'Matricule', invalid: 7 },
      { screen: 'chefs_agence', title: "Ajouter un Chef d'Agence", first: 'Matricule', invalid: 6 },
      { screen: 'chefs_secteur', title: 'Ajouter un Chef de Secteur', first: 'Matricule', invalid: 6 },
    ]) {
      test(`${config.screen} : validation locale, libellés et fermeture`, async ({ page }) => {
        const writes: string[] = [];
        await page.route('**/rest/v1/**', async route => {
          if (!['GET', 'HEAD'].includes(route.request().method())) writes.push(route.request().url());
          const url = route.request().url();
          const rows = url.includes('/regions?') ? [{ id: '1', nom: 'Région test', codeRegion: 'R1', description: '' }]
            : url.includes('/agences?') ? [{ id: '1', nom: 'Agence test', codePDV: 'PDV01', region: 'Région test', is_current: true }]
            : url.includes('/secteurs?') ? [{ id: '1', nom: 'Secteur test', codeSecteur: 'SEC01', region: 'Région test' }] : [];
          await route.fulfill({ json: rows });
        });
        await page.goto(`/tests/fixtures/business-forms.html?screen=${config.screen}`);
        await page.getByRole('button', { name: config.title, exact: true }).click();
        const dialog = page.locator('[data-app-dialog]');
        await expect(dialog.getByRole('heading', { name: config.title, exact: true })).toBeVisible();
        // « Annuler » est présent : pas de croix en double.
        await expect(dialog.getByRole('button', { name: 'Annuler', exact: true })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: 'Fermer', exact: true })).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
        await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(config.invalid);
        const first = dialog.getByLabel(new RegExp(`^${config.first}`));
        await expect(first).toBeFocused();
        await expect(first).toHaveAccessibleDescription(/renseignez|obligatoire/i);
        await first.fill('Exemple');
        await expect(first).toHaveAttribute('aria-invalid', 'false');
        if (config.screen === 'agences') {
          await dialog.getByLabel(/^Région/).click();
          await page.getByPlaceholder('Rechercher une région...').fill('Région test');
          await page.getByRole('option', { name: /Région test/ }).click();
          await expect(page.getByRole('option', { name: /Région test/ })).toHaveCount(0);
          await expect(dialog.getByLabel(/^Région/)).toContainText('Région test');
          await expect(dialog.getByLabel('Latitude', { exact: true })).toBeVisible();
        }
        if (['techniciens', 'guichetieres', 'chefs_agence', 'chefs_secteur'].includes(config.screen)) {
          await dialog.getByRole('button', { name: 'Afficher le mot de passe' }).click();
          await expect(dialog.getByLabel(/^Mot de passe/)).toHaveAttribute('type', 'text');
        }
        if (config.screen === 'chefs_agence') {
          await dialog.getByLabel(/^Agence en charge/).click();
          await page.getByRole('option', { name: 'Agence test', exact: true }).click();
          await expect(dialog.getByLabel('Code PDV', { exact: true })).toHaveValue('PDV01');
          await expect(dialog.getByLabel(/^Agence en charge/)).toHaveAttribute('aria-invalid', 'false');
        }
        if (config.screen === 'chefs_secteur') {
          await dialog.getByLabel(/^Secteur en charge/).click();
          await page.getByRole('option', { name: /Secteur test/ }).click();
          await expect(dialog.getByLabel('Code Secteur', { exact: true })).toHaveValue('SEC01');
        }
        if (config.screen === 'guichetieres') {
          await dialog.getByLabel('Disponibilité', { exact: true }).click();
          await page.getByRole('option', { name: 'Absent', exact: true }).click();
          await dialog.getByLabel(/^Début d'indisponibilité/).fill('2026-11-10');
          await dialog.getByLabel(/^Fin d'indisponibilité/).fill('2026-11-09');
          await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
          await expect(dialog.getByLabel(/^Fin d'indisponibilité/)).toHaveAccessibleDescription('La fin ne peut pas précéder le début.');
          await dialog.getByLabel(/^Fin d'indisponibilité/).fill('2026-11-11');
          await expect(dialog.getByLabel(/^Fin d'indisponibilité/)).toHaveAttribute('aria-invalid', 'false');
        }
        if (width === 360) await page.screenshot({ path: `test-results/form-${config.screen}-mobile.png`, fullPage: true, animations: 'disabled' });
        await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(writes).toEqual([]);
      });
    }
  });
}

test('les formulaires restent protégés en lecture seule', async ({ page }) => {
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  for (const screen of ['regions', 'secteurs', 'agences', 'techniciens', 'guichetieres', 'chefs_agence', 'chefs_secteur']) {
    await page.goto(`/tests/fixtures/business-forms.html?screen=${screen}&readonly=1`);
    await expect(page.getByRole('button', { name: /^Ajouter (un|une) / })).toBeDisabled();
  }
});
