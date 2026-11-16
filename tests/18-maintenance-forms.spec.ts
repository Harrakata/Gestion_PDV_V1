import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    const rows = url.includes('/modeles_sous_ensembles?')
      ? [{ id: 'm1', nom: 'Modèle test', sous_ensemble: 'imprimante' }]
      : url.includes('/stock_defectueux?')
        ? [{ id: 's1', reference_sous_ensemble: 'IMP001', type_sous_ensemble: 'imprimante', type_terminal: '2020', statut: 'defectueux', date_entree: '2026-11-01T10:00:00Z', agence: { nom: 'Agence test' } }]
        : url.includes('/techniciens?')
          ? [{ id: 't1', nom: 'Test', prenom: 'Alice', matricule: 'TECH01' }]
          : [];
    await route.fulfill({ json: rows });
  });
});

test('la création d’un équipement affiche les erreurs sous les champs et propose les modèles', async ({ page }) => {
  await page.goto('/tests/fixtures/maintenance-forms.html');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).first().click();
  const dialog = page.locator('[data-app-dialog]');
  await dialog.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(3);
  await expect(dialog.getByLabel(/^Référence/)).toBeFocused();
  await dialog.getByLabel(/^Référence/).fill('IMP001');
  await dialog.getByLabel(/^Modèle/).click();
  await page.getByRole('option', { name: 'Modèle test' }).click();
  await expect(dialog.getByLabel(/^Modèle/)).toHaveAttribute('aria-invalid', 'false');
  await expect(dialog.getByLabel(/^Marque/)).toHaveAccessibleDescription('Ce champ est obligatoire.');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
});

test('l’assignation en stock défectueux associe le libellé au choix du technicien', async ({ page }) => {
  await page.goto('/tests/fixtures/maintenance-forms.html?screen=stock');
  await page.getByRole('button', { name: 'Assigner IMP001' }).click();
  const dialog = page.locator('[data-app-dialog]');
  const trigger = dialog.getByLabel(/^Technicien/);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByPlaceholder('Rechercher par nom ou matricule...').fill('TECH01');
  await page.getByRole('option', { name: /Alice Test/ }).click();
  await expect(trigger).toContainText('Alice Test');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
});

test('la configuration d’un terminal indique les champs manquants sous les contrôles', async ({ page }) => {
  await page.goto('/tests/fixtures/maintenance-forms.html?screen=configuration');
  await page.getByRole('button', { name: 'Sauvegarder le terminal' }).click();
  const fields = page.locator('[data-terminal-config-fields]');
  await expect(fields.getByRole('combobox', { name: /^Région/ })).toHaveAttribute('aria-invalid', 'true');
  await expect(fields.getByRole('textbox', { name: /^Référence/ })).toHaveAttribute('aria-invalid', 'true');
  await expect(fields.getByRole('textbox', { name: /^Position/ })).toHaveAttribute('aria-invalid', 'true');
  await expect(fields.getByRole('combobox', { name: /^Région/ })).toBeFocused();
  await fields.getByRole('textbox', { name: /^Référence/ }).fill('TERM-001');
  await expect(fields.getByRole('textbox', { name: /^Référence/ })).toHaveAttribute('aria-invalid', 'false');
  await fields.getByRole('textbox', { name: /^Référence/ }).press('Enter');
  await expect(fields.getByRole('combobox', { name: /^Région/ })).toBeFocused();
});

test('la modification d’un terminal garde les libellés et valide la référence', async ({ page }) => {
  await page.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    const rows = url.includes('/agences?')
      ? [{ id: 'a1', nom: 'Agence test', region: 'Nord', secteur: 'Secteur test', codePDV: '001', nbreTerminaux: 2 }]
      : url.includes('/terminaux?')
        ? [{ id: 'term1', reference: 'TERM-001', type_terminal: '2020', position: 'Guichet 1', agence_id: 'a1', statut: 'actif' }]
        : [];
    await route.fulfill({ json: rows });
  });
  await page.goto('/tests/fixtures/maintenance-forms.html?screen=configuration');
  await page.getByRole('button', { name: 'Modifier le terminal TERM-001' }).click();
  const dialog = page.locator('[data-app-dialog]');
  const reference = dialog.getByRole('textbox', { name: /^Référence/ });
  await expect(reference).toHaveValue('TERM-001');
  await reference.fill('');
  await dialog.getByRole('button', { name: 'Mettre à jour le terminal' }).click();
  await expect(reference).toHaveAttribute('aria-invalid', 'true');
  await expect(reference).toHaveAccessibleDescription('Saisissez une référence.');
  await expect(reference).toBeFocused();
});
