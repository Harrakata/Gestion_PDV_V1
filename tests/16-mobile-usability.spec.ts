import { test, expect, type Locator } from '@playwright/test';

test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

async function gesture(target: Locator, dx: number, dy: number, multitouch = false) {
  await target.evaluate((element, { dx, dy, multitouch }) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + 100, y = rect.top + 20;
    const touch = (clientX: number, clientY: number, identifier = 1) => new Touch({ identifier, target: element, clientX, clientY });
    const first = touch(x, y), last = touch(x + dx, y + dy);
    element.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [first], changedTouches: [first] }));
    element.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [last], changedTouches: [last] }));
    if (multitouch) element.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [last, touch(x + 20, y, 2)] }));
    element.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [last] }));
  }, { dx, dy, multitouch });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/mobile-usability.html');
  await expect(page.getByRole('heading', { name: 'Ergonomie mobile' })).toBeVisible();
});

test('champs lisibles, actions tactiles et fenêtre accessible en portrait et paysage', async ({ page }) => {
  for (const [index, viewport] of [{ width: 360, height: 740 }, { width: 740, height: 360 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }].entries()) {
    await page.setViewportSize(viewport);
    const trigger = page.getByRole('button', { name: 'Ouvrir le formulaire' });
    if (viewport.width < 768) {
      expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(35.5); // 36 px partout (cf. 21-mobile-scale)
      // 12px au moins ici ; iOS reçoit 16px via @supports (-webkit-touch-callout) pour éviter le zoom.
      expect(await page.getByLabel('Notes').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
    }
    await trigger.click();
    const dialog = page.locator('[data-app-dialog]');
    await expect(dialog).toBeVisible();
    await expect.poll(async () => {
      const rect = (await dialog.boundingBox())!;
      return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1;
    }).toBe(true);
    await page.getByLabel(/^Référence/).fill('TRM-001');
    await dialog.getByLabel('Agence', { exact: true }).click();
    const agency = `Agence ${30 - index}`;
    await page.getByPlaceholder('Rechercher une agence').fill(agency);
    await page.getByRole('option', { name: agency, exact: true }).click();
    await expect(page.getByTestId('submits')).toHaveText('0');
    await expect(dialog.getByLabel('Agence', { exact: true })).toHaveText(agency);
    await dialog.getByRole('button', { name: 'Annuler' }).click();
  }
});

test('le filtre en bas de l’écran reste visible et sélectionnable', async ({ page }) => {
  const trigger = page.getByLabel('Agence du filtre');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const panel = page.locator('.anchored-popover');
  await expect(panel).toBeVisible();
  const bounds = (await panel.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(740);
  await page.getByPlaceholder('Rechercher une agence').fill('Agence 30');
  await page.getByRole('option', { name: 'Agence 30', exact: true }).click();
  await expect(trigger).toHaveText('Agence 30');
});

test('une liste ouverte au clavier place le curseur dans sa recherche et rend le focus à la fermeture', async ({ page }) => {
  const trigger = page.getByLabel('Agence du filtre');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const search = page.getByPlaceholder('Rechercher une agence');
  await expect(search).toBeFocused();
  await page.keyboard.type('Agence 29');
  await expect(page.getByRole('option', { name: 'Agence 29', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(page.locator('.anchored-popover')).toHaveCount(0);
});

test('les surfaces de maintenance suivent le thème sombre', async ({ page }) => {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    const workspace = document.createElement('div');
    workspace.className = 'maintenance-terminal-workspace';
    workspace.innerHTML = '<div class="maintenance-table-shell"><table><thead><tr><th>Référence</th></tr></thead></table></div>';
    document.body.append(workspace);
  });
  const colors = await page.evaluate(() => {
    const card = document.createElement('div');
    card.className = 'bg-card';
    document.body.append(card);
    const cardColor = getComputedStyle(card).backgroundColor;
    card.remove();
    return {
      cardColor,
      tableColor: getComputedStyle(document.querySelector('.maintenance-table-shell')!).backgroundColor,
      headerColor: getComputedStyle(document.querySelector('.maintenance-table-shell th')!).backgroundColor,
    };
  });
  expect(colors.tableColor).toBe(colors.cardColor);
  expect(colors.headerColor).not.toBe('rgb(248, 250, 252)');
});

test('les gestes respectent les champs, tableaux et mouvements à plusieurs doigts', async ({ page }) => {
  await gesture(page.getByLabel('Recherche'), -90, 0);
  await gesture(page.getByRole('cell').first(), -90, 0);
  await expect(page.getByTestId('active')).toHaveText('0');
  await gesture(page.getByTestId('gesture-area'), -90, 0);
  await expect(page.getByTestId('active')).toHaveText('1');
  await gesture(page.getByLabel('Recherche'), 0, 180);
  await gesture(page.getByTestId('gesture-area'), 0, 180, true);
  await expect(page.getByTestId('refreshes')).toHaveText('0');
  await gesture(page.getByTestId('gesture-area'), 0, 180);
  await expect(page.getByTestId('refreshes')).toHaveText('1');
});

test('l’onglet sélectionné est révélé sans déplacer la page et le tableau défile au toucher', async ({ page }) => {
  await page.getByRole('button', { name: 'Dernier onglet' }).click();
  const tab = page.getByRole('tab', { name: 'Rubrique 8' });
  await expect(tab).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const table = page.getByRole('region', { name: 'Tableau : Terminaux' });
  await table.scrollIntoViewIfNeeded();
  const rect = (await table.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: rect.y + 20 }] });
  for (let x = 280; x >= 60; x -= 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: rect.y + 20 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => table.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByTestId('active')).toHaveText('7');
  await page.screenshot({ path: 'test-results/mobile-usability.png', fullPage: true });
});

test('la croix disparaît quand la barre d’actions propose « Annuler » ou « Fermer », et seulement dans ce cas', async ({ page }) => {
  const dialog = page.locator('[data-app-dialog]');
  const cross = dialog.locator('.app-dialog-close');
  await page.getByRole('button', { name: 'Ouvrir le formulaire' }).click();
  await expect(dialog.getByRole('button', { name: 'Annuler', exact: true })).toBeVisible();
  await expect(cross).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Ouvrir le formulaire' }).click();
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // « Annuler » hors barre d'actions : la croix reste.
  await page.getByRole('button', { name: 'Voir la fiche' }).click();
  await expect(cross).toBeVisible();
  await dialog.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(cross).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(dialog.getByRole('button', { name: 'Fermer', exact: true })).toHaveCount(1);
  await expect(cross).toHaveCount(0);
  await dialog.locator('[data-dialog-actions]').getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Voir la fiche' }).click();
  await expect(cross).toBeVisible();
  await cross.click();
  await expect(dialog).toHaveCount(0);
});
