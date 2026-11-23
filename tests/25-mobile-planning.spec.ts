import { test, expect, type Locator, type Page } from '@playwright/test';

// Calendrier compact sur téléphone. Données simulées : rien n'est lu ni écrit en base.
const open = async (page: Page, screen: string) => {
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00'));
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  const guichetieres = [['g1', 'Awa', 'Diallo'], ['g2', 'Fatou', 'Keita'], ['g3', 'Mariam', 'Traoré']]
    .map(([id, prenom, nom]) => ({ id, prenom, nom, codePrepose: id, matricule: id, disponibilite: 'Disponible' }));
  const planning = [
    { id: 'p1', date: '2026-11-23', guichetiereId: 'g1', agenceNom: 'Gombe', est_remplacante: false },
    { id: 'p2', date: '2026-11-23', guichetiereId: 'g2', agenceNom: 'Gombe', est_remplacante: true },
    { id: 'p3', date: '2026-11-25', guichetiereId: 'g3', agenceNom: 'Gombe', est_remplacante: false },
  ];
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, route => {
    const url = route.request().url();
    if (route.request().method() !== 'GET') return route.abort();
    const rows = /\/planning\?/.test(url) ? planning
      : /\/guichetieres\?/.test(url) ? guichetieres
        : /\/planning_maintenance\?/.test(url) ? [{ id: 'm1', date_planification: '2026-11-24', creneau: 'matin', agence_nom: 'Gombe', statut: 'planifiee', technicien_id: 't1' }]
          : /\/agences\?/.test(url) ? [{ id: 'a1', nom: 'Gombe', nbreTerminaux: 3, codePDV: '001' }] : [];
    const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    return single && rows.length === 0
      ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } })
      : route.fulfill({ json: single ? rows[0] : rows });
  });
  await page.goto(`/tests/fixtures/big-screens.html?screen=${screen}`);
  await page.waitForLoadState('networkidle');
  const calendar = page.locator('[data-mobile-calendar]');
  await expect(calendar).toBeVisible();
  return calendar;
};

test.describe('téléphone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  const swipe = async (page: Page, calendar: Locator, dx: number, dy = 0) => {
    await calendar.scrollIntoViewIfNeeded();
    const box = (await calendar.locator('button[aria-pressed]').nth(15).boundingBox())!;
    const from = { x: 180, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let i = 1; i <= 6; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (dx * i) / 6, y: from.y + (dy * i) / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  for (const screen of ['planning', 'guichetiere', 'technicien', 'general']) {
    test(`${screen} : le mois entier tient dans la largeur et sous 300 px de haut`, async ({ page }) => {
      const calendar = await open(page, screen);
      const cells = calendar.locator('button[aria-pressed]');
      await expect(cells).toHaveCount(30);
      const boxes = await cells.evaluateAll(list => list.map(el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, w: b.width, h: b.height }; }));
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(360);
        expect(Math.min(box.w, box.h)).toBeGreaterThanOrEqual(34);
      }
      expect(Math.max(...boxes.map(b => b.bottom)) - Math.min(...boxes.map(b => b.top))).toBeLessThan(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      // Le 1er novembre 2026 est un dimanche : dernière colonne.
      expect(boxes[0].left).toBeGreaterThan(boxes[1].left);
      expect(boxes[1].top).toBeGreaterThan(boxes[0].top);
      await expect(calendar.getByRole('button', { name: /lundi 23 novembre/ })).toHaveAttribute('aria-current', 'date');
    });
  }

  test('chef d’agence : toucher un jour affiche son détail, modifiable ; ajout possible au doigt', async ({ page }) => {
    const calendar = await open(page, 'planning');
    const detail = calendar.getByRole('region', { name: 'Détail du jour' });
    // Aujourd'hui par défaut, avec les noms complets.
    await expect(detail).toContainText(/lundi 23 novembre/i);
    await expect(detail.getByRole('button', { name: /Awa Diallo/ })).toBeVisible();
    await expect(detail.getByRole('button', { name: /Fatou Keita/ })).toContainText('Remplaçante');
    await expect(calendar.getByRole('button', { name: 'lundi 23 novembre, 2 guichetières' })).toHaveAttribute('aria-pressed', 'true');

    await calendar.getByRole('button', { name: /mercredi 25 novembre/ }).tap();
    await expect(detail.getByRole('button', { name: /Mariam Traoré/ })).toBeVisible();
    await expect(detail.getByText('Awa Diallo')).toHaveCount(0);
    await detail.getByRole('button', { name: 'Planifier' }).tap();
    await expect(page.locator('[data-app-dialog]')).toBeVisible();
    await page.keyboard.press('Escape');

    // Jour passé : consultation seule.
    await calendar.getByRole('button', { name: /lundi 2 novembre/ }).tap();
    await expect(detail).toContainText('Aucune guichetière planifiée ce jour.');
    await expect(detail.getByRole('button', { name: 'Planifier' })).toHaveCount(0);
  });

  test('planning maintenance : compact, lui aussi, sans débordement', async ({ page }) => {
    await page.route(/\/rest\/v1\//, route => route.fulfill({ json: [] }));
    await page.goto('/tests/fixtures/maintenance-forms.html?screen=chef');
    await page.getByRole('tab', { name: /Planification/ }).tap();
    const calendar = page.locator('[data-mobile-calendar]');
    await expect(calendar).toBeVisible();
    await expect(calendar.getByRole('region', { name: 'Détail du jour' })).toContainText('Aucune maintenance ce jour.');
    await expect(page.getByRole('button', { name: /Aujourd'hui|Auj\./ })).toHaveCount(0);
    const picker = page.getByLabel('Aller à une date');
    await expect(picker).toBeVisible();
    expect(await picker.evaluate(el => el.scrollWidth <= el.clientWidth), 'date entière').toBe(true);
    await picker.fill('2027-02-09');
    await expect(calendar.getByText('février 2027')).toBeVisible();
    await expect(calendar.getByRole('button', { name: /mardi 9 février/ })).toHaveAttribute('aria-pressed', 'true');
    await calendar.getByRole('button', { name: /jeudi 18 février/ }).tap();
    await expect(picker).toHaveValue('2027-02-18');
    await swipe(page, calendar, -140);
    await expect(calendar.getByText('mars 2027')).toBeVisible();
    await expect(picker).toHaveValue('2027-03-18');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('vue semaine : une seule ligne de sept jours', async ({ page }) => {
    const calendar = await open(page, 'planning');
    await page.getByRole('button', { name: 'Semaine', exact: true }).tap();
    const cells = calendar.locator('button[aria-pressed]');
    await expect(cells).toHaveCount(7);
    const tops = await cells.evaluateAll(list => new Set(list.map(el => Math.round(el.getBoundingClientRect().top))).size);
    expect(tops).toBe(1);
  });

  for (const screen of ['planning', 'guichetiere', 'technicien', 'general']) {
    test(`${screen} : glisser change de mois, sans flèches visibles`, async ({ page }) => {
      const calendar = await open(page, screen);
      await expect(calendar.getByText('novembre 2026')).toBeVisible();
      await expect(page.getByRole('button', { name: /^(Mois|Semaine|Période) (précédente?|suivante?)$/ })).toHaveCount(2); // masqués, pour le clavier
      for (const button of await page.getByRole('button', { name: /^(Mois|Semaine|Période) (précédente?|suivante?)$/ }).all()) {
        expect((await button.boundingBox())!.width).toBeLessThanOrEqual(1);
      }
      await swipe(page, calendar, -140);
      await expect(calendar.getByText('décembre 2026')).toBeVisible();
      await expect(calendar.locator('button[aria-pressed]')).toHaveCount(31);
      await swipe(page, calendar, 140);
      await expect(calendar.getByText('novembre 2026')).toBeVisible();
      await swipe(page, calendar, 140);
      await expect(calendar.getByText('octobre 2026')).toBeVisible();
      // Ni un petit mouvement, ni un défilement vertical ne changent de mois.
      await swipe(page, calendar, -25);
      await swipe(page, calendar, -60, 160);
      await expect(calendar.getByText('octobre 2026')).toBeVisible();
    });
  }

  test('glisser sur le calendrier ne change pas d’onglet et ne sélectionne pas de jour', async ({ page }) => {
    const calendar = await open(page, 'planning');
    expect(await calendar.evaluate(el => el.matches('[data-no-swipe]'))).toBe(true);
    await calendar.getByRole('button', { name: /mercredi 25 novembre/ }).tap();
    await swipe(page, calendar, -140);
    await expect(calendar.getByText('décembre 2026')).toBeVisible();
    await swipe(page, calendar, 140);
    await expect(calendar.getByRole('button', { name: /mercredi 25 novembre/ })).toHaveAttribute('aria-pressed', 'true');
  });

  for (const screen of ['planning', 'guichetiere', 'technicien', 'general']) {
    test(`${screen} : le sélecteur de date remplace « Aujourd’hui » et choisit le jour`, async ({ page }) => {
      const calendar = await open(page, screen);
      await expect(page.getByRole('button', { name: /^(Aujourd'hui|Auj\.)$/ })).toHaveCount(0);
      const picker = page.getByLabel('Aller à une date');
      await expect(picker).toBeVisible();
      await expect(picker).toHaveValue('2026-11-23');
      await calendar.getByRole('button', { name: /jeudi 12 novembre/ }).tap();
      await expect(picker).toHaveValue('2026-11-12');
      await picker.fill('2027-02-09');
      await expect(calendar.getByText('février 2027')).toBeVisible();
      await expect(calendar.getByRole('button', { name: /mardi 9 février/ })).toHaveAttribute('aria-pressed', 'true');
      // Retour à aujourd'hui depuis le sélecteur.
      await picker.fill('2026-11-23');
      await expect(calendar.getByRole('button', { name: /lundi 23 novembre/ })).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('clavier : boutons de période atteignables et Page suivante / précédente', async ({ page }) => {
    const calendar = await open(page, 'planning');
    const next = calendar.getByRole('button', { name: 'Période suivante' });
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(calendar.getByText('décembre 2026')).toBeVisible();
    await page.keyboard.press('PageUp');
    await expect(calendar.getByText('novembre 2026')).toBeVisible();
  });

  test('changer de mois garde un jour affiché dans la période', async ({ page }) => {
    const calendar = await open(page, 'planning');
    await swipe(page, calendar, -140);
    await expect(calendar.locator('button[aria-pressed]')).toHaveCount(31);
    await expect(calendar.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await expect(calendar.getByRole('region', { name: 'Détail du jour' })).toContainText(/décembre/);
  });
});

test('ordinateur : la grande grille reste inchangée', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00'));
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, route => route.fulfill({ json: [] }));
  await page.goto('/tests/fixtures/big-screens.html?screen=planning');
  await expect(page.locator('.planning-calendar')).toBeVisible();
  await expect(page.locator('[data-mobile-calendar]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: "Aujourd'hui", exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Période suivante' })).toBeVisible();
  await page.getByLabel('Aller à une date').fill('2027-02-09');
  await expect(page.getByText('février 2027')).toBeVisible();
});
