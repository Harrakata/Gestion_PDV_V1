import { test, expect, type Page } from '@playwright/test';

// Échelle mobile : 36 px partout, mesurés dans #main-content — la portée réelle des
// règles « Mobile / PWA » d'index.css. Une page de test sans #main-content recevrait
// d'autres tailles que l'application. Données simulées, aucun accès à la base.
test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

const CONTROL_HEIGHT = 36;
const CONTROLS = [
  '[data-ui-button]', '[role="tab"]', 'button[role="combobox"]', 'select', 'textarea',
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="hidden"])',
].join(',');

const SCREENS: Array<[string, string]> = [
  ['composants', '/tests/fixtures/mobile-usability.html'],
  ['équipements', '/tests/fixtures/maintenance-forms.html'],
  ['stock défectueux', '/tests/fixtures/maintenance-forms.html?screen=stock'],
  ['configuration terminaux', '/tests/fixtures/maintenance-forms.html?screen=configuration'],
  ['maintenance chef', '/tests/fixtures/maintenance-forms.html?screen=chef'],
  ...['regions', 'secteurs', 'agences', 'techniciens', 'guichetieres', 'chefs_agence', 'chefs_secteur']
    .map((screen): [string, string] => [screen, `/tests/fixtures/business-forms.html?screen=${screen}`]),
];

// Tailles d'affichage proposées dans Paramètres (racine 14, 16 ou 18 px).
const setRootSize = (page: Page, size: number) =>
  page.evaluate(value => { document.documentElement.style.fontSize = `${value}px`; }, size);

const measure = (page: Page, scope: string) => page.evaluate(([scopeSelector, selector]) =>
  [...document.querySelectorAll<HTMLElement>(`${scopeSelector} :is(${selector})`)]
    .filter(element => element.checkVisibility() && element.offsetWidth > 1 && !element.closest('.sr-only'))
    .map(element => ({
      name: `${element.getAttribute('role') || element.tagName.toLowerCase()} « ${(element.innerText || element.getAttribute('aria-label') || element.id || '').trim().slice(0, 30)} »`,
      tag: element.tagName,
      height: Math.round(element.getBoundingClientRect().height * 10) / 10,
      clipped: element.matches('input, button[role="combobox"]') && element.scrollHeight > element.clientHeight + 1,
    })), [scope, CONTROLS]);

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', route => {
    const url = route.request().url();
    const rows = url.includes('/stock_defectueux?')
      ? [{ id: 's1', reference_sous_ensemble: 'IMP001', type_sous_ensemble: 'imprimante', type_terminal: '2020', statut: 'defectueux', date_entree: '2026-11-01T10:00:00Z', agence: { nom: 'Agence test' } }]
      : url.includes('/agences?')
        ? [{ id: 'a1', nom: 'Agence test', region: 'Nord', secteur: 'Secteur test', codePDV: '001', nbreTerminaux: 2 }]
        : url.includes('/terminaux?')
          ? [{ id: 'term1', reference: 'TERM-001', type_terminal: '2020', position: 'Guichet 1', agence_id: 'a1', statut: 'actif' }]
          : [];
    return route.fulfill({ json: rows });
  });
});

for (const [name, url] of SCREENS) {
  test(`${name} : aucun contrôle sous 36 px, quelle que soit la taille d’affichage`, async ({ page }) => {
    await page.goto(url);
    await expect(page.locator('#main-content')).toHaveCount(1);
    await expect(page.locator('#main-content').locator(CONTROLS).first()).toBeVisible();
    for (const size of [14, 16, 18]) {
      await setRootSize(page, size);
      await expect.poll(async () => (await measure(page, '#main-content')).filter(c => c.height < CONTROL_HEIGHT - 0.5),
        { message: `racine ${size}px` }).toEqual([]);
      expect((await measure(page, '#main-content')).filter(c => c.clipped), `contenu rogné, racine ${size}px`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  });
}

test('les contrôles simples mesurent exactement 36 px, dans la page comme dans une fenêtre', async ({ page }) => {
  await page.goto('/tests/fixtures/mobile-usability.html');
  const exact = async (scope: string) => {
    const controls = (await measure(page, scope)).filter(c => c.tag !== 'TEXTAREA');
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) expect(control.height, control.name).toBeCloseTo(CONTROL_HEIGHT, 0);
  };
  await exact('#main-content');
  await page.getByRole('button', { name: 'Ouvrir le formulaire' }).click();
  const dialog = page.locator('[data-app-dialog]');
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400); // fin de l'animation d'ouverture
  await exact('[data-app-dialog]');
  // Rempli : le libellé remonte au-dessus de la valeur, sans agrandir le champ.
  await dialog.getByLabel(/^Référence/).fill('TRM-001');
  await dialog.getByLabel('Agence', { exact: true }).click();
  const option = page.getByRole('option', { name: 'Agence 2', exact: true });
  await expect(option).toBeVisible();
  // poll : la liste s'ouvre avec un léger effet d'échelle
  await expect.poll(async () => (await option.boundingBox())!.height).toBeGreaterThanOrEqual(CONTROL_HEIGHT - 0.5);
  await option.click();
  await expect(dialog.getByLabel('Agence', { exact: true })).toHaveText('Agence 2');
  await exact('[data-app-dialog]');
});

test('le libellé d’un champ rempli ne recouvre pas la valeur', async ({ page }) => {
  await page.goto('/tests/fixtures/mobile-usability.html');
  await page.getByRole('button', { name: 'Ouvrir le formulaire' }).click();
  const dialog = page.locator('[data-app-dialog]');
  const input = dialog.getByLabel(/^Référence/);
  await input.fill('TRM-001');
  await dialog.getByRole('heading').click(); // quitte le champ
  for (const size of [14, 16, 18]) {
    await setRootSize(page, size);
    const gap = await input.evaluate(element => {
      const label = document.querySelector(`label[for="${element.id}"]`)!.getBoundingClientRect();
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop) - label.bottom;
    });
    expect(gap, `racine ${size}px`).toBeGreaterThanOrEqual(-1);
  }
});

test('en-tête et tiroir de menu : 36 px au moins', async ({ page }) => {
  await page.goto('/tests/fixtures/space-shell.html');
  const menu = page.getByRole('button', { name: 'Ouvrir le menu', exact: true });
  await expect(menu).toBeVisible();
  for (const size of [14, 16, 18]) {
    await setRootSize(page, size);
    await expect.poll(async () => {
      const box = (await menu.boundingBox())!;
      return Math.min(box.width, box.height);
    }, { message: `menu, racine ${size}px` }).toBeGreaterThanOrEqual(CONTROL_HEIGHT - 0.5);
  }
  await setRootSize(page, 14);
  await menu.click();
  const entry = page.locator('.app-space-sidebar.is-open').getByText('Mes rapports').locator('xpath=ancestor-or-self::*[self::a or self::button][1]');
  await expect(entry).toBeVisible();
  await expect.poll(async () => (await entry.boundingBox())!.height).toBeGreaterThanOrEqual(CONTROL_HEIGHT - 0.5);
});
