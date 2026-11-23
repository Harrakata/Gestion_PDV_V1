import { test, expect, type Page } from '@playwright/test';

// Filtres repliés sur téléphone. Données simulées : rien n'est lu ni écrit en base.
const open = async (page: Page, screen: string) => {
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00'));
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, route => {
    const url = route.request().url();
    // Seules lectures passant par POST : fonctions SQL de suivi.
    if (/\/rpc\//.test(url)) return route.fulfill({ json: [{ id_trm_mobi: 'MOBI-1', hors_service: 40, date_suivi: '2026-11-22' }] });
    if (route.request().method() !== 'GET') return route.abort();
    const rows = /\/cln_fnir_ccopeglob\?/.test(url) ? [{ id: 1, id_ccopeglob: 1, date_op: '2026-11-12', prepose: '101', pari: 'COUPLE', nombre_trans: 2 }]
      : /\/cln_fnir_ccope\?/.test(url)
      ? [
        { id: 1, date_op: '2026-11-12', operateur: '101', mt_enr: 1000, nt_enr: 3 },
        { id: 2, date_op: '2026-11-13', operateur: '102', mt_enr: 2000, nt_enr: 5 },
      ]
      : /\/guichetieres\?/.test(url) ? [['101', 'Awa', 'Gombe'], ['102', 'Fatou', 'Limete']].map(([codePrepose, prenom, agenceAssigne]) => ({ id: codePrepose, codePrepose, code_prepose: codePrepose, prenom, nom: 'Test', agenceAssigne }))
        : /\/agences\?/.test(url) ? [{ id: 'a1', nom: 'Gombe', region: 'Kinshasa', secteur: 'Nord' }, { id: 'a2', nom: 'Limete', region: 'Kinshasa' }]
          : /\/points_vente_mobi\?/.test(url) ? [{ id: 'p1', pointVenteUid: 'u1', codePointVente: 'PDV-001', region: 'Kinshasa', agenceNom: 'Gombe', terminalReference: 'MOBI-1', dateDebutValidite: '2026-01-01', statut: 'Actif' }]
          : /\/terminaux_mobi\?/.test(url) ? [{ id: 'm1', reference: 'MOBI-1', statut: 'Actif' }]
          : /\/regions\?/.test(url) ? [{ id: 'r1', nom: 'Kinshasa' }]
            : /\/techniciens\?/.test(url) ? [{ id: 't1', nom: 'Test', prenom: 'Alice', statut: 'actif' }] : [];
    const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    return single && rows.length === 0
      ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } })
      : route.fulfill({ json: single ? rows[0] : rows });
  });
  await page.goto(`/tests/fixtures/big-screens.html?screen=${screen}`);
  await page.waitForLoadState('networkidle');
};

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const screens = [
  { screen: 'ccope', search: 'Rechercher une opération', filters: ['Région', 'Agences', 'Guichetière', 'Préposé'] },
  { screen: 'planification', search: /Rechercher une agence/, filters: ['Régions', 'Agences', 'Techniciens', 'Créneaux', 'Suivis'] },
  { screen: 'ccopeglob', search: 'Rechercher une opération détaillée', filters: ['Région', 'Agences', 'Guichetière', 'Tous les paris', 'Préposé'] },
  { screen: 'mobi', search: 'Rechercher une agence', filters: ['Région', 'Conformité'] },
  { screen: 'maintenance', search: /Rechercher un terminal/, filters: ['Régions', 'Agences', 'Terminaux', 'Suivi'] },
];
// Écrans dont les filtres sont des listes de formulaire (libellé dans le champ).
const forms = [
  { screen: 'general', search: 'Agence en charge', fields: ["Chef d'Agence", 'Période'], context: 'Ce mois-ci' },
  { screen: 'rapports', fields: ['Du', 'Au', 'Région', 'Secteur', 'Agence'], context: 'Ce mois' },
  { screen: 'performance', fields: ['Mois', 'Région', 'Secteur', 'Agence'], context: 'novembre 2026' },
  { screen: 'salaire', fields: ['Mois', 'Sans groupement', 'Région', 'Agences', 'Guichetière', 'Préposé'], context: 'novembre 2026' },
  { screen: 'regional', search: /Rechercher un terminal/, fields: ['Agence', 'Terminal', 'Suivi maintenance'], context: 'Filtres' },
  { screen: 'enjeux', fields: ['Région', 'Secteur', 'Agence', 'Point de vente', 'Guichetière', 'Terminal Mobi', 'Du', 'Au', 'Regroupement temporel'], context: 'Jusqu’au 23/11/2026 · par mois' },
];

test.describe('téléphone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  for (const { screen, search, filters } of screens) {
    test(`${screen} : une seule ligne repliée, deux colonnes dépliées`, async ({ page }) => {
      await open(page, screen);
      const bar = page.locator('[data-mobile-filters]');
      const toggle = bar.getByRole('button', { name: 'Filtres' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(bar.getByRole('combobox')).toHaveCount(0);
      const field = bar.getByLabel(search);
      const [a, b] = [(await field.boundingBox())!, (await toggle.boundingBox())!];
      expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(2);
      expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(64);

      await toggle.tap();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      for (const name of filters) await expect(bar.getByRole('combobox').filter({ hasText: name })).toBeVisible();
      const boxes = await bar.getByRole('combobox').evaluateAll(list => list.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, w: r.width, h: r.height, cut: el.scrollWidth > el.clientWidth + 1 }; }));
      expect(new Set(boxes.map(box => Math.round(box.x))).size).toBe(2);
      for (const box of boxes) {
        expect(box.right).toBeLessThanOrEqual(360);
        expect(box.w).toBeGreaterThan(120);
        expect(box.h).toBeLessThanOrEqual(40);
        expect(box.cut).toBe(false);
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  for (const { screen, search, fields, context } of forms) {
    test(`${screen} : une seule ligne repliée, champs lisibles dépliés`, async ({ page }) => {
      await open(page, screen);
      const bar = page.locator('[data-mobile-filters]');
      const toggle = bar.getByRole('button', { name: /^Filtres/ });
      await expect(bar).toContainText(context);
      if (search) await expect(bar.getByLabel(search)).toBeVisible();
      expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(64);
      expect(await toggle.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await toggle.tap();
      for (const field of fields) await expect(bar.getByText(field, { exact: true }).first()).toBeVisible();
      const boxes = await bar.locator('input[type="date"], [role="combobox"], input[type="text"], input:not([type])').evaluateAll(list => list.map(el => { const r = el.getBoundingClientRect(); return { right: r.right, left: r.left, h: r.height, cut: el.matches('input') && el.scrollWidth > el.clientWidth + 1 }; }));
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(360);
        expect(box.h).toBeLessThanOrEqual(46);
        expect(box.cut).toBe(false);
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('rapports : raccourci et périmètre rappelés quand la barre est repliée', async ({ page }) => {
    await open(page, 'rapports');
    const bar = page.locator('[data-mobile-filters]');
    await bar.getByRole('button', { name: /^Filtres/ }).tap();
    await bar.getByRole('button', { name: '7 jours' }).tap();
    await bar.getByRole('combobox').last().tap();
    await page.getByRole('option', { name: 'Gombe' }).tap();
    const toggle = bar.getByRole('button', { name: /^Filtres, 1 actif/ });
    await toggle.tap();
    await expect(toggle).toContainText('7 jours · Gombe');
    await toggle.tap();
    await bar.getByRole('button', { name: 'Effacer les filtres' }).tap();
    await expect(bar.getByRole('button', { name: 'Filtres : 7 jours' })).toBeVisible();
  });

  test('general : plage personnalisée, calendrier dans l’écran', async ({ page }) => {
    await open(page, 'general');
    const bar = page.locator('[data-mobile-filters]');
    await bar.getByRole('button', { name: /^Filtres/ }).tap();
    await bar.getByRole('combobox').tap();
    await page.getByRole('option', { name: 'Plage personnalisée' }).tap();
    await bar.locator('button[aria-haspopup="dialog"]').tap();
    const panel = page.locator('[data-radix-popper-content-wrapper] > *');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(400);
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'calendrier entier').toBe(true);
    const offsets = await panel.locator('td:has(button)').evaluateAll(list => list.map(td => { const a = td.getBoundingClientRect(), b = td.querySelector('button')!.getBoundingClientRect(); return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)); }));
    expect(offsets.length).toBeGreaterThanOrEqual(30);
    expect(Math.max(...offsets), 'jour centré dans sa case').toBeLessThanOrEqual(1);
    await expect(panel.getByRole('button', { name: 'Mois suivant' })).toBeVisible();
    // Les titres de jours restent alignés sur les colonnes.
    const centers = await panel.evaluate(el => { const c = (e: Element) => { const r = e.getBoundingClientRect(); return r.x + r.width / 2; }; return [[...el.querySelectorAll('thead th')].map(c), [...el.querySelectorAll('tbody tr')[1].querySelectorAll('td')].map(c)]; });
    centers[0].forEach((x, i) => expect(Math.abs(x - centers[1][i])).toBeLessThanOrEqual(2));
  });

  test('ccope : un filtre replié reste signalé, puis s’efface', async ({ page }) => {
    await open(page, 'ccope');
    const bar = page.locator('[data-mobile-filters]');
    await expect(bar).toContainText('novembre 2026');
    await bar.getByRole('button', { name: 'Filtres' }).tap();
    await bar.getByRole('combobox').filter({ hasText: 'Agences' }).tap();
    await page.getByRole('option', { name: 'Gombe' }).tap();
    const toggle = bar.getByRole('button', { name: 'Filtres, 1 actif(s)' });
    await toggle.tap();
    await expect(bar).toContainText('novembre 2026 · Gombe');
    expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(64);
    await toggle.tap();
    await bar.getByRole('button', { name: 'Effacer les filtres' }).tap();
    await expect(bar.getByRole('button', { name: 'Filtres', exact: true })).toBeVisible();
    for (const mode of ['Tout', 'Semaine', 'Période']) {
      await bar.getByRole('button', { name: mode, exact: true }).tap();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });

  test('ccope : groupement et colonnes tiennent sur la ligne du titre', async ({ page }) => {
    await open(page, 'ccope');
    const title = (await page.getByText('Détail des opérations').boundingBox())!;
    const group = page.getByRole('button', { name: 'Grouper : Aucun groupement' });
    for (const button of [group, page.getByRole('button', { name: 'Colonnes' })]) {
      const box = (await button.boundingBox())!;
      expect(Math.abs(box.y + box.height / 2 - title.y - title.height / 2)).toBeLessThanOrEqual(6);
    }
    await group.tap();
    await page.getByRole('button', { name: 'Agence', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Grouper : Agence' })).toBeVisible();
  });

  test('ccope : le menu de groupement s’applique et reste lisible', async ({ page }) => {
    await open(page, 'ccope');
    await page.getByRole('button', { name: 'Grouper : Aucun groupement' }).tap();
    for (const name of ['Aucun groupement', 'Guichetière', 'Code Opérateur']) {
      const option = page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name });
      expect(await option.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth)).toBe(true);
    }
  });

  test('ccopeglob : période, filtre, groupement et colonnes', async ({ page }) => {
    await open(page, 'ccopeglob');
    const bar = page.locator('[data-mobile-filters]');
    await expect(bar).toContainText('Toutes les dates');
    await bar.getByRole('button', { name: 'Filtres' }).tap();
    for (const mode of ['Semaine', 'Période', 'Mois']) {
      await bar.getByRole('button', { name: mode, exact: true }).tap();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
    await bar.getByRole('combobox').filter({ hasText: 'Tous les paris' }).tap();
    await page.getByRole('option', { name: 'COUPLE' }).tap();
    await bar.getByRole('button', { name: 'Filtres, 1 actif(s)' }).tap();
    await expect(bar).toContainText('novembre 2026 · COUPLE');
    const title = (await page.getByRole('heading', { name: 'Données', exact: true }).boundingBox())!;
    const group = page.getByRole('button', { name: 'Grouper : Aucun groupement' });
    const columns = page.getByRole('button', { name: 'Colonnes' });
    for (const button of [group, columns]) expect((await button.boundingBox())!.y).toBeLessThan(title.y + title.height);
    await group.tap();
    const panel = page.locator('[data-radix-popper-content-wrapper] > *');
    await page.waitForTimeout(400);
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await panel.getByRole('button', { name: 'Agence', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Grouper : Agence' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('salaire : filtre et groupement rappelés, colonnes sur la même ligne', async ({ page }) => {
    await open(page, 'salaire');
    const bar = page.locator('[data-mobile-filters]');
    const toggle = bar.getByRole('button', { name: /^Filtres/ });
    const columns = bar.getByRole('button', { name: 'Colonnes affichées' });
    const [a, b] = [(await toggle.boundingBox())!, (await columns.boundingBox())!];
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThanOrEqual(2);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
    await columns.tap();
    const menu = (await page.locator('.anchored-popover').boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(360);
    await page.keyboard.press('Escape');
    await toggle.tap();
    await bar.getByRole('combobox', { name: 'Groupement' }).tap();
    await page.getByRole('option', { name: 'Grouper par Agence' }).tap();
    await bar.getByRole('combobox').filter({ hasText: 'Agences' }).tap();
    await page.getByRole('option', { name: 'Gombe' }).tap();
    await page.keyboard.press('Escape');
    await expect(bar.getByRole('button', { name: /^Filtres, 1 actif/ })).toHaveAttribute('aria-label', /novembre 2026 · par Agence · Gombe/);
    expect(await toggle.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await bar.getByRole('button', { name: 'Effacer les filtres' }).tap();
    await expect(bar.getByRole('button', { name: 'Filtres : novembre 2026 · par Agence' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('regional : agence rappelée repliée, puis effacée', async ({ page }) => {
    await open(page, 'regional');
    const bar = page.locator('[data-mobile-filters]');
    await bar.getByRole('button', { name: 'Filtres' }).tap();
    await bar.getByRole('combobox').first().tap();
    await page.getByRole('option', { name: 'Gombe' }).tap();
    await bar.getByRole('button', { name: 'Filtres, 1 actif(s)' }).tap();
    await expect(bar).toContainText('Gombe');
    await bar.getByRole('button', { name: 'Filtres, 1 actif(s)' }).tap();
    await bar.getByRole('button', { name: 'Effacer les filtres' }).tap();
    await expect(bar.getByRole('button', { name: 'Filtres', exact: true })).toBeVisible();
  });

  test('performance : région rappelée repliée, puis effacée', async ({ page }) => {
    await open(page, 'performance');
    const bar = page.locator('[data-mobile-filters]');
    await bar.getByRole('button', { name: /^Filtres/ }).tap();
    await bar.getByRole('combobox').first().tap();
    await page.getByRole('option', { name: 'Kinshasa' }).tap();
    await expect(bar.getByRole('button', { name: /^Filtres, 1 actif/ })).toContainText('novembre 2026 · Kinshasa');
    await bar.getByRole('button', { name: 'Effacer les filtres' }).tap();
    await expect(bar.getByRole('button', { name: 'Filtres : novembre 2026' })).toBeVisible();
  });

  test('planification : choix multiples signalés puis effacés', async ({ page }) => {
    await open(page, 'planification');
    const bar = page.locator('[data-mobile-filters]');
    await bar.getByRole('button', { name: 'Filtres' }).tap();
    await bar.getByRole('combobox').filter({ hasText: 'Suivis' }).tap();
    await page.getByRole('option', { name: 'Planifiée' }).tap();
    await page.getByRole('option', { name: 'Annulée' }).tap();
    await page.keyboard.press('Escape');
    const toggle = bar.getByRole('button', { name: 'Filtres, 1 actif(s)' });
    await toggle.tap();
    await expect(bar).toContainText('Planifiée, Annulée');
    await toggle.tap();
    await bar.getByRole('button', { name: 'Effacer les filtres' }).tap();
    await expect(bar.getByRole('combobox').filter({ hasText: 'Suivis' })).toBeVisible();
  });
});

for (const [width, height] of [[320, 568], [360, 780], [768, 1024], [1440, 780]]) {
  test(`le menu de groupement s’ouvre contre son bouton, dans l’écran (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, 'ccope');
    const button = page.getByRole('button', { name: /Aucun groupement/ }).first();
    await button.click();
    const panel = page.locator('[data-radix-popper-content-wrapper] > *');
    await expect(panel).toBeVisible();
    await page.waitForTimeout(400);
    const [b, p] = [(await button.boundingBox())!, (await panel.boundingBox())!];
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(width);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y + p.height).toBeLessThanOrEqual(height);
    expect(Math.abs(p.x + p.width - b.x - b.width), 'aligné sur le bord droit du bouton').toBeLessThanOrEqual(2);
    expect(Math.min(Math.abs(p.y - b.y - b.height), Math.abs(b.y - p.y - p.height)), 'contre le bouton').toBeLessThanOrEqual(8);
  });
}

for (const { screen, filters } of screens) {
  test(`${screen} : sur ordinateur, les filtres restent tous visibles`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, screen);
    await expect(page.locator('[data-mobile-filters]')).toHaveCount(0);
    for (const name of filters) await expect(page.getByRole('combobox').filter({ hasText: name }).first()).toBeVisible();
  });
}

for (const { screen, fields } of forms) {
  test(`${screen} : sur ordinateur, les champs restent visibles`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, screen);
    await expect(page.locator('[data-mobile-filters]')).toHaveCount(0);
    for (const field of fields.filter(name => !(screen === 'salaire' && name === 'Mois'))) await expect(page.getByText(field, { exact: true }).first()).toBeVisible();
  });
}
