import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto('/tests/fixtures/design-system.html');
});

test('une seule carte porte un liseré, lié à la couleur du thème', async ({ page }) => {
  const primary = page.getByTestId('primary-card');
  const secondary = page.getByTestId('secondary-card');
  await expect(primary.locator('[data-card-rail]')).toHaveCount(1);
  await expect(secondary.locator('[data-card-rail]')).toHaveCount(0);
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
    const colors = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'hsl(var(--primary))';
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { expected, rail: getComputedStyle(document.querySelector('[data-card-rail]')!).backgroundColor };
    });
    expect(colors.rail).toBe(colors.expected);
  }
});

test('les onglets restent centrés, répartis et lisibles dans les deux thèmes', async ({ page }) => {
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const dark of [false, true]) {
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      const tabs = page.getByRole('tablist', { name: 'Sections' });
      const boxes = await Promise.all((await tabs.getByRole('tab').all()).map(tab => tab.boundingBox()));
      expect(boxes.every(Boolean)).toBe(true);
      const widths = boxes.map(box => box!.width);
      const listBox = (await tabs.boundingBox())!;
      if (width >= 768) {
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
      } else {
        const groupCenter = (boxes[0]!.x + boxes.at(-1)!.x + boxes.at(-1)!.width) / 2;
        expect(Math.abs(groupCenter - (listBox.x + listBox.width / 2))).toBeLessThanOrEqual(6);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await expect.poll(() => tabs.evaluate(list => {
        const active = list.querySelector('[role="tab"][data-state="active"]')!;
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'hsl(var(--card))';
        document.body.append(probe);
        const card = getComputedStyle(probe).backgroundColor;
        probe.style.backgroundColor = 'hsl(var(--primary))';
        const brand = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return getComputedStyle(list).backgroundColor === card && getComputedStyle(active).backgroundColor === brand;
      })).toBe(true);
    }
  }
  await page.getByRole('tab', { name: 'Détails' }).click();
  await expect(page.getByText('Détails du dossier')).toBeVisible();
});

test('le formulaire et les actions conservent leurs repères accessibles sur téléphone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(page.getByRole('heading', { level: 1, name: 'Contrats visuels' })).toHaveCount(1);
  const input = page.getByRole('textbox', { name: /Référence/ });
  await expect(input).toHaveAccessibleDescription('Indiquez une référence unique.');
  const action = page.getByRole('button', { name: 'Vérifier' });
  expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  await action.click();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(input).toHaveAccessibleDescription('Indiquez une référence unique. La référence est obligatoire.');
  await input.fill('REF-001');
  await expect(page.getByText('Actif', { exact: true })).toBeVisible();
  await expect(page.getByText('Bloqué', { exact: true })).toBeVisible();
});
