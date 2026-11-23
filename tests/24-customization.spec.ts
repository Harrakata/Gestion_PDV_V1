import { test, expect, type Page } from '@playwright/test';

// Personnalisation PC et mobile. `app_settings` est simulée en mémoire : rien n'est
// lu ni écrit dans la base.
type Store = Record<string, unknown>;

const mockSettings = async (page: Page, store: Store, writes: Array<{ method: string; body: any }> = []) => {
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.endsWith('/app_settings')) return route.fulfill({ json: [] });
    if (request.method() !== 'GET') {
      const body = request.postDataJSON();
      writes.push({ method: request.method(), body });
      const key = body.key ?? (url.searchParams.get('id') || '').replace('eq.id-', '');
      store[key] = body.value;
      return route.fulfill({ status: 204, body: '' });
    }
    const key = (url.searchParams.get('key') || '').replace('eq.', '');
    const row = key in store ? { id: `id-${key}`, key, value: store[key] } : null;
    const single = (request.headers().accept || '').includes('vnd.pgrst.object');
    return single && !row
      ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } })
      : route.fulfill({ json: single ? row : row ? [row] : [] });
  });
};

const openSettings = async (page: Page, section: RegExp) => {
  await page.goto('/tests/fixtures/big-screens.html?screen=parametres');
  const toggle = page.getByRole('button', { name: section });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
};
const THEME = /^Personnalisation —/;
const MOBILE = /^Personnalisation App Mobile/;
const root = (page: Page, read: string) => page.evaluate(expr => {
  const el = document.documentElement;
  if (expr.startsWith('data:')) return el.dataset[expr.slice(5)];
  return getComputedStyle(el).getPropertyValue(expr).trim();
}, read);
const cached = (page: Page, key: string) => page.evaluate(k => localStorage.getItem(k), key);

test('un changement reste un aperçu : annulable, jamais mémorisé avant enregistrement', async ({ page }) => {
  const writes: Array<{ method: string; body: any }> = [];
  await mockSettings(page, { theme_colors: { primaryHsl: '217 91% 60%', radius: 0.875 } }, writes);
  const panel = await openSettings(page, THEME);
  await expect(panel.getByText('Aucune modification en attente.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

  await panel.getByRole('radio', { name: 'Vert', exact: true }).click();
  await panel.getByRole('radiogroup', { name: 'Densité' }).getByRole('radio', { name: 'Compacte' }).click();
  await expect(panel.getByText(/2 modifications en aperçu/)).toBeVisible();
  await expect(page.getByText('Non enregistré')).toBeVisible();
  expect(await root(page, '--primary')).toMatch(/^142 /);
  expect(await root(page, 'data:density')).toBe('compact');
  expect(await cached(page, 'app_theme_cache')).toBeNull();
  expect(writes).toEqual([]);

  // Replier la section ne perd pas le brouillon.
  await page.getByRole('button', { name: THEME }).click();
  await page.getByRole('button', { name: THEME }).click();
  await expect(panel.getByText(/2 modifications en aperçu/)).toBeVisible();

  await panel.getByRole('button', { name: 'Annuler' }).click();
  expect(await root(page, '--primary')).toMatch(/^217 /);
  expect(await root(page, 'data:density')).toBe('normal');
  await expect(page.getByText('Non enregistré')).toHaveCount(0);
});

test('couleur libre : code hexadécimal, rendu annoncé, aucun chevauchement', async ({ page }) => {
  await mockSettings(page, { theme_colors: { primaryHsl: '217 91% 60%' } });
  const panel = await openSettings(page, THEME);
  const field = panel.getByLabel('Code hexadécimal de la couleur');
  await field.fill('#aa');
  expect(await root(page, '--primary')).toMatch(/^217 /);
  await field.fill('#FACC15');
  await expect.poll(() => root(page, '--primary')).toMatch(/^48 /);
  await expect(panel.getByText('Luminosité ajustée pour que les textes restent lisibles.')).toBeVisible();
  const last = (await panel.getByRole('radio', { name: 'Ardoise' }).boundingBox())!;
  const custom = (await panel.getByTitle('Couleur personnalisée').boundingBox())!;
  expect(custom.x >= last.x + last.width || custom.y >= last.y + last.height).toBe(true);
});

test('enregistrer écrit la valeur complète, met le cache à jour et vide le brouillon', async ({ page }) => {
  const writes: Array<{ method: string; body: any }> = [];
  await mockSettings(page, { theme_colors: { primaryHsl: '217 91% 60%', darkMode: true, bgId: 'dots' } }, writes);
  const panel = await openSettings(page, THEME);
  // Ancien format repris : mode sombre et fond pointillé.
  await expect(panel.getByRole('radiogroup', { name: 'Apparence' }).getByRole('radio', { name: 'Sombre' })).toBeChecked();
  await expect(panel.getByRole('radiogroup', { name: 'Motif du fond de page' }).getByRole('radio', { name: 'Pointillé' })).toBeChecked();
  await panel.getByRole('radiogroup', { name: 'Style du menu latéral' }).getByRole('radio', { name: 'Couleur' }).click();
  await panel.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(panel.getByText('Aucune modification en attente.')).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].method).toBe('PATCH');
  expect(writes[0].body.value).toMatchObject({ primaryHsl: '217 91% 60%', appearance: 'dark', darkMode: true, pagePattern: 'dots', sidebarStyle: 'brand', density: 'normal' });
  expect(JSON.parse((await cached(page, 'app_theme_cache'))!)).toMatchObject({ sidebarStyle: 'brand' });
});

test('sans connexion, les réglages ne peuvent pas être écrasés', async ({ page }) => {
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, route => route.fulfill({ status: 503, json: { message: 'indisponible' } }));
  const panel = await openSettings(page, THEME);
  await expect(panel.getByText('Réglages indisponibles')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Réessayer' })).toBeVisible();
});

test('exporter puis importer rejoue les réglages ; un fichier étranger est refusé', async ({ page }) => {
  await mockSettings(page, { theme_colors: { primaryHsl: '217 91% 60%' } });
  const panel = await openSettings(page, THEME);
  await panel.getByRole('group', { name: 'Ambiances' }).getByRole('button', { name: /Dense/ }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Exporter' }).click()]);
  const path = await download.path();
  await panel.getByRole('button', { name: 'Annuler' }).click();
  expect(await root(page, 'data:density')).toBe('normal');
  const input = panel.locator('input[type="file"]');
  await input.setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: (await import('node:fs')).readFileSync(path!) });
  await expect.poll(() => root(page, 'data:density')).toBe('compact');
  await expect(panel.getByRole('group', { name: 'Ambiances' }).getByRole('button', { name: /Dense/ })).toHaveAttribute('aria-pressed', 'true');
  await input.setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"type":"autre","values":{"density":"comfort"}}') });
  await expect.poll(() => root(page, 'data:density')).toBe('compact');
});

test('apparence Auto : suit le réglage de l’appareil, sans rechargement', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mockSettings(page, { theme_colors: { primaryHsl: '217 91% 60%', appearance: 'auto' } });
  await page.addInitScript(() => localStorage.setItem('app_theme_cache', JSON.stringify({ primaryHsl: '217 91% 60%', appearance: 'auto' })));
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
});

// Même instance de module que la page : Vite peut servir l'adresse avec « ?t=… ».
const apply = (page: Page, kind: 'theme' | 'mobile', values: object) => page.evaluate(async ([k, v]) => {
  const file = k === 'theme' ? '/src/lib/theme.js' : '/src/lib/mobileCustomization.js';
  const loaded = performance.getEntriesByType('resource').map(entry => new URL(entry.name)).filter(url => url.pathname === file).pop();
  const module = await import(/* @vite-ignore */ loaded ? loaded.pathname + loaded.search : file);
  if (k === 'theme') module.applyTheme(v, { persist: false });
  else module.applyMobileCustomization(v);
}, [kind, values] as const);

const BASE = { primaryHsl: '217 91% 60%', animations: false };
const DESKTOP: Array<[string, object]> = [
  ['fond gris', { pageBackground: 'neutral' }], ['fond subtil', { pageBackground: 'light' }], ['fond uni', { pageBackground: 'plain' }],
  ['dégradé', { pagePattern: 'gradient' }], ['pointillé', { pagePattern: 'dots' }], ['grille', { pagePattern: 'grid' }],
  ['menu teinté', { sidebarStyle: 'tinted' }], ['menu couleur', { sidebarStyle: 'brand' }], ['menu étroit', { sidebarWidth: 'narrow' }], ['menu large', { sidebarWidth: 'wide' }],
  ['densité compacte', { density: 'compact' }], ['densité aérée', { density: 'comfort' }], ['contraste', { highContrast: true }],
  ['coins droits', { radius: 0 }], ['sans ombre', { shadowId: 'none' }], ['taille 14', { zoom: 14 }], ['taille 20', { zoom: 20 }], ['sombre', { appearance: 'dark' }],
];

test('PC : chaque option change réellement l’affichage', async ({ page }) => {
  await mockSettings(page, {});
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tests/fixtures/space-shell.html');
  await expect(page.getByRole('heading', { name: 'Mon planning' })).toBeVisible();
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;caret-color:transparent!important}' });
  const shot = async (values: object) => { await apply(page, 'theme', { ...BASE, ...values }); await page.waitForTimeout(120); return (await page.screenshot()).toString('base64'); };
  const reference = await shot({});
  for (const [name, values] of DESKTOP) expect.soft((await shot(values)) === reference, name).toBe(false);
  expect((await shot({})) === reference, 'retour aux valeurs d’origine').toBe(true);
});

test('PC : le menu à la couleur du client reste lisible, en clair comme en sombre', async ({ page }) => {
  await mockSettings(page, {});
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tests/fixtures/space-shell.html');
  for (const primaryHsl of ['217 91% 60%', '38 92% 50%', '142 71% 45%']) for (const appearance of ['light', 'dark']) {
    await apply(page, 'theme', { ...BASE, primaryHsl, appearance, sidebarStyle: 'brand' });
    await page.waitForTimeout(250); // fin des transitions de couleur
    const faint = await page.locator('.space-sidebar-card').evaluate(card => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const rgba = (c: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
      const lum = (c: number[]) => c.slice(0, 3).map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      return [...card.querySelectorAll<HTMLElement>('a, button, span')].filter(el => el.innerText?.trim() && el.offsetWidth > 2 && !el.closest('[disabled]')).map(el => {
        let bg = [255, 255, 255, 1];
        for (let n: HTMLElement | null = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0.99) { bg = c; break; } }
        const [a, b] = [lum(rgba(getComputedStyle(el).color)), lum(bg)];
        return { text: el.innerText.trim().slice(0, 20), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      }).filter(x => x.ratio < 4.5);
    });
    expect(faint, `${primaryHsl} ${appearance}`).toEqual([]);
  }
});

test.describe('téléphone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test('chaque option change réellement l’affichage, sans débordement', async ({ page }) => {
    await mockSettings(page, {});
    await page.goto('/tests/fixtures/space-shell.html');
    await expect(page.locator('.mobile-tabbar')).toBeVisible();
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
    await apply(page, 'theme', BASE);
    const shot = async (values: object) => { await apply(page, 'mobile', values); await page.waitForTimeout(120); return (await page.screenshot()).toString('base64'); };
    const reference = await shot({});
    const options: Array<[string, object]> = [
      ['pleine largeur', { tabStyle: 'full' }], ['actif plein', { tabActive: 'solid' }], ['libellé actif', { tabLabels: 'active' }], ['icônes seules', { tabLabels: 'none' }],
      ['3 raccourcis', { tabCount: 3 }], ['hauteur', { tabHeight: '5rem' }], ['icônes', { tabIcon: '1.35rem' }], ['ombre', { tabbarShadow: 'prononcee' }],
      ['boutons 44', { controlHeight: 44 }], ['taille', { fontScale: 1.2 }],
    ];
    for (const [name, values] of options) {
      expect.soft((await shot(values)) === reference, name).toBe(false);
      expect.soft(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} : débordement`).toBeLessThanOrEqual(0);
    }
    expect((await shot({})) === reference, 'retour aux valeurs d’origine').toBe(true);
    await apply(page, 'theme', { ...BASE, pageBackground: 'neutral', pagePattern: 'dots' });
    expect.soft((await shot({})) === reference, 'fond de page').toBe(false);
  });

  test('arrondi unique : en-tête, barre, menu et assistant suivent le réglage', async ({ page }) => {
    await mockSettings(page, {});
    await page.goto('/tests/fixtures/space-shell.html');
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
    // Anciens réglages séparés encore en base : sans effet.
    await apply(page, 'mobile', { cardRadius: '2rem', headerRadius: '2rem' });
    const radii = (selector: string) => page.evaluate(sel => [...document.querySelectorAll<HTMLElement>(sel)]
      .filter(el => el.checkVisibility() && el.offsetWidth > 4)
      .filter(el => { const s = getComputedStyle(el); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(s.borderTopWidth) > 0; })
      .map(el => ({ el: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`, round: /rounded-full/.test(String(el.className)), radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) })), selector);
    const PARTS = '.app-space-mobile-header, .app-space-mobile-header *, .mobile-tabbar, .mobile-tabbar *, .app-space-sidebar, .app-space-sidebar *, [data-operational-assistant], [data-operational-assistant] *, button[aria-label*="ssistant"]';
    for (const radius of [0, 0.875]) {
      await apply(page, 'theme', { ...BASE, radius });
      for (const panel of ['menu', 'assistant']) {
        if (panel === 'menu') await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
        else await page.getByRole('button', { name: /assistant/i }).first().click();
        await page.waitForTimeout(300);
        const parts = (await radii(PARTS)).filter(part => !part.round);
        expect(parts.length).toBeGreaterThan(3);
        if (radius === 0) expect.soft(parts.filter(part => part.radius > 0), panel).toEqual([]);
        else expect.soft(parts.find(part => /mobile-tabbar$|mobile-tabbar /.test(part.el))?.radius, 'barre d’onglets').toBeCloseTo(24, 0);
        if (panel === 'menu') await page.getByRole('button', { name: 'Fermer le menu', exact: true }).click();
        else await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }
  });

  test('icônes seules : les onglets gardent leur nom', async ({ page }) => {
    await mockSettings(page, {});
    await page.goto('/tests/fixtures/space-shell.html');
    await apply(page, 'mobile', { tabLabels: 'none' });
    await expect(page.locator('.mobile-tabbar').getByRole('button', { name: 'Mon planning' })).toBeVisible();
    await apply(page, 'mobile', { tabCount: 3 });
    await expect(page.locator('.mobile-tabbar').getByRole('button')).toHaveCount(4);
  });

  test('profil Terrain : boutons de 44 px ; Standard : retour à 36 px', async ({ page }) => {
    await mockSettings(page, {});
    const panel = await openSettings(page, MOBILE);
    const profiles = panel.getByRole('group', { name: "Profils d'usage" });
    const button = panel.getByRole('button', { name: 'Valeurs par défaut' });
    const height = async () => Math.round((await button.boundingBox())!.height);
    expect(await height()).toBe(36);
    await profiles.getByRole('button', { name: /Terrain/ }).click();
    await expect(profiles.getByRole('button', { name: /Terrain/ })).toHaveAttribute('aria-pressed', 'true');
    // « Terrain » agrandit aussi le contenu (110 %).
    await expect.poll(height).toBeGreaterThanOrEqual(44);
    await profiles.getByRole('button', { name: /Standard/ }).click();
    await expect.poll(height).toBe(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('la barre d’état suit la couleur du client ou le fond', async ({ page }) => {
    await mockSettings(page, {});
    await page.goto('/');
    const color = () => page.locator('meta[name="theme-color"]').getAttribute('content');
    await apply(page, 'theme', { ...BASE, primaryHsl: '142 71% 45%' });
    await apply(page, 'mobile', { statusBar: 'brand' });
    const brand = await color();
    expect(brand).not.toBe('#2563eb');
    await apply(page, 'mobile', { statusBar: 'page' });
    expect(await color()).toBe('#ffffff');
    await apply(page, 'mobile', { statusBar: 'brand' });
    expect(await color()).toBe(brand);
  });
});
