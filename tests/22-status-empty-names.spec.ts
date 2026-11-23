import { test, expect, type Page } from '@playwright/test';

// Statuts, états vides et noms accessibles, sur les écrans de test (données simulées).
const SCREENS: Array<[string, string]> = [
  ['équipements', '/tests/fixtures/maintenance-forms.html'],
  ['stock défectueux', '/tests/fixtures/maintenance-forms.html?screen=stock'],
  ['configuration terminaux', '/tests/fixtures/maintenance-forms.html?screen=configuration'],
  ['maintenance chef', '/tests/fixtures/maintenance-forms.html?screen=chef'],
  ...['regions', 'secteurs', 'agences', 'techniciens', 'guichetieres', 'chefs_agence', 'chefs_secteur']
    .map((screen): [string, string] => [screen, `/tests/fixtures/business-forms.html?screen=${screen}`]),
];

const mock = (page: Page, filled: boolean) => page.route('**/rest/v1/**', route => {
  const url = route.request().url();
  const person = { id: 'p1', nom: 'Diallo', prenom: 'Awa', matricule: 'M01', statut: 'Actif', region: 'Nord', secteur: 'Secteur test', agence: 'Agence test', agenceAssigne: 'Agence test', is_current: true };
  const rows = !filled ? []
    : url.includes('/stock_defectueux?') ? ['defectueux', 'assigne', 'a_tester', 'repare'].map((statut, i) => ({ id: `s${i}`, reference_sous_ensemble: `IMP00${i}`, type_sous_ensemble: 'imprimante', type_terminal: '2020', statut, date_entree: '2026-11-01T10:00:00Z', agence: { nom: 'Agence test' } }))
      : url.includes('/agences?') ? [{ id: 'a1', nom: 'Agence test', region: 'Nord', secteur: 'Secteur test', codePDV: '001', nbreTerminaux: 2 }]
        : url.includes('/terminaux?') ? [{ id: 'term1', reference: 'TERM-001', type_terminal: '2020', position: 'Guichet 1', agence_id: 'a1', statut: 'actif' }]
          : url.includes('/equipments_') ? [{ id: 'e1', reference: 'EQ-001', modele: 'M', marque: 'X', statut: 'En panne' }]
            : /\/(techniciens|guichetieres|chefs_agence|chefs_secteur)\?/.test(url) ? [person]
              : /\/(regions|secteurs)\?/.test(url) ? [{ id: 'r1', nom: 'Nord', code: 'N', region: 'Nord', is_current: true }] : [];
  return route.fulfill({ json: rows });
});

for (const [name, url] of SCREENS) {
  for (const filled of [true, false]) {
    test(`${name} (${filled ? 'avec données' : 'vide'}) : chaque bouton a un nom, sans débordement à 360 px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width: 360, height: 780 });
      await mock(page, filled);
      await page.goto(url);
      const buttons = page.locator('#main-content').getByRole('button');
      await expect(page.locator('#main-content')).toContainText(/\S/);
      await page.waitForLoadState('networkidle');
      for (const button of await buttons.all()) {
        await expect(button, await button.evaluate(el => el.outerHTML.slice(0, 160))).toHaveAccessibleName(/\S/);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}

test('les statuts du stock défectueux gardent leur sens, en clair comme en sombre', async ({ page }) => {
  await mock(page, true);
  await page.goto('/tests/fixtures/maintenance-forms.html?screen=stock');
  const expected: Record<string, string> = { Défectueux: '--destructive', Assigné: '--info-muted-foreground', 'À tester': '--warning-muted-foreground', Réparé: '--success-muted-foreground' };
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
    for (const [label, token] of Object.entries(expected)) {
      const badge = page.getByRole('table').getByText(label, { exact: true }).first();
      await expect(badge).toBeVisible();
      await expect.poll(() => badge.evaluate((el, key) => {
        const probe = document.createElement('i');
        probe.style.color = `hsl(var(${key}))`;
        document.body.append(probe);
        const same = getComputedStyle(probe).color === getComputedStyle(el).color;
        probe.remove();
        return same;
      }, token), { message: `${label} ${dark ? 'sombre' : 'clair'}` }).toBe(true);
    }
  }
});

test('un message vide n’ajoute pas de titre à la page', async ({ page }) => {
  await mock(page, false);
  await page.goto('/tests/fixtures/business-forms.html?screen=chefs_agence');
  const message = page.getByText("Aucun chef d'agence trouvé", { exact: true });
  await expect(message).toBeVisible();
  expect(await message.evaluate(el => el.tagName)).toBe('P');
});
