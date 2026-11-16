import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('le suivi de maintenance du chef d’agence s’utilise au clavier', async ({ page }) => {
  const ficheUrl = 'https://example.invalid/fiche-maintenance.html';
  await page.route('**/rest/v1/**', async route => {
    const url = route.request().url();
    const rows = url.includes('/agences?')
      ? [{ id: 'a1', nom: 'Agence test', codePDV: '001', region: 'Nord' }]
      : url.includes('/terminaux?')
        ? [{ id: 'term1', agence_id: 'a1', reference: 'TERM-001', type_terminal: '2020', position: 'Guichet 1', statut: 'actif', imprimante_reference: 'IMP001' }]
        : url.includes('/interventions_maintenance?')
          ? [{ id: 'int1', terminal_id: 'term1', sous_ensemble: 'IMP001', type_intervention: 'curative', statut: 'Terminée', date_intervention: new Date().toISOString(), fiche_url: ficheUrl }]
          : [];
    await route.fulfill({ json: rows });
  });
  await page.route(ficheUrl, route => route.fulfill({ contentType: 'text/html', body: '<h1>Fiche test</h1>' }));
  await page.goto('/tests/fixtures/maintenance-forms.html?screen=chef');

  await expect(page.getByLabel('Suivi maintenance')).toBeVisible();
  await page.getByRole('button', { name: 'Voir sous-ensembles' }).click();
  const history = page.getByRole('button', { name: /Imprimante.*IMP001/ });
  await history.click();
  const fiche = page.getByRole('button', { name: /Voir la fiche de maintenance du/ });
  await fiche.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Fiche de maintenance' })).toBeVisible();
});
