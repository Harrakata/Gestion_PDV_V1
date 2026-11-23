import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

// Logo du produit. Aucune donnée réelle n'est lue.
const open = async (page: Page, logoUrl: string) => {
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, route => {
    if (route.request().method() !== 'GET') return route.abort();
    const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    if (/client_branding/.test(route.request().url())) {
      const row = { key: 'client_branding', value: { displayName: 'Client test', logoUrl, currency: 'XOF' } };
      return route.fulfill({ json: single ? row : [row] });
    }
    return single ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } }) : route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};

for (const width of [360, 1440]) {
  test(`sans logo client : icône GPDV en en-tête et logo détouré en titre (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, '');
    const logo = page.getByRole('heading', { level: 1 }).getByRole('img');
    await expect(page.locator('.app-top-header img')).toHaveAttribute('src', /gpdv-logo/);
    await page.waitForTimeout(600);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
      await expect(logo).toHaveCount(1);
      await expect.poll(() => logo.evaluate(el => (el as HTMLImageElement).currentSrc)).toContain(`gpdv-home-${width < 640 ? 'tall' : 'wide'}-${theme}`);
      await expect.poll(() => logo.evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const box = (await logo.boundingBox())!;
      expect(Math.abs(box.width / box.height - (width < 640 ? 1.18 : 3.6))).toBeLessThan(0.06);
      expect(box.x).toBeGreaterThan(0);
      expect(box.x + box.width).toBeLessThan(width);
      expect(Math.abs(box.x + box.width / 2 - width / 2), 'centré').toBeLessThanOrEqual(10);
      // Sans fond : le coin de l'image est transparent.
      expect(await logo.evaluate(el => { const c = document.createElement('canvas'); c.width = 20; c.height = 20; const g = c.getContext('2d')!; g.drawImage(el as HTMLImageElement, 0, 0, 20, 20, 0, 0, 20, 20); return Math.max(...g.getImageData(0, 0, 20, 20).data.filter((_, i) => i % 4 === 3)); })).toBeLessThan(8);
    }
    await expect(page).toHaveTitle('GPDV Client test');
    await expect(page.locator('body')).not.toContainText(/Gestion ?PDV/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('le logo du client garde la priorité ; le logo du produit reste', async ({ page }) => {
  await open(page, '/carrus-logo.png');
  await expect(page.locator('.app-top-header img')).toHaveAttribute('src', '/carrus-logo.png');
  await expect(page.getByRole('heading', { level: 1 }).getByRole('img')).toHaveAttribute('src', /gpdv-home/);
  await expect(page.locator('#main-content img[src="/carrus-logo.png"]')).toBeVisible();
});

test('toutes les icônes déclarées existent à la bonne taille', async () => {
  const refs = ['index.html', 'vite.config.js', 'public/push-sw.js', 'src/lib/clientConfig.js']
    .flatMap(file => [...readFileSync(file, 'utf8').matchAll(/['"](\/(?:brand\/)?[\w-]+\.(?:png|webp|svg))['"]/g)].map(match => match[1]));
  expect(refs.length).toBeGreaterThanOrEqual(8);
  for (const ref of refs) expect(existsSync(`public${ref}`), ref).toBe(true);
  const size = (file: string) => { const b = readFileSync(`public/${file}`); return [b.readUInt32BE(16), b.readUInt32BE(20), b[25]]; };
  for (const [file, px] of [['brand/gpdv-icon-192.png', 192], ['brand/gpdv-icon-512.png', 512], ['brand/gpdv-maskable-512.png', 512], ['brand/gpdv-favicon-32.png', 32], ['brand/gpdv-badge-96.png', 96], ['apple-touch-icon.png', 180]] as const) {
    expect(size(file).slice(0, 2), file).toEqual([px, px]);
  }
  // Transparence (type 6) : icône et pastille. Opaques (type 2) : Android rogné et iOS.
  expect(size('brand/gpdv-icon-512.png')[2]).toBe(6);
  expect(size('brand/gpdv-badge-96.png')[2]).toBe(6);
  expect(size('brand/gpdv-maskable-512.png')[2]).toBe(2);
  expect(size('apple-touch-icon.png')[2]).toBe(2);
});

for (const [name, width] of [['ordinateur', 1280], ['tiroir du téléphone', 360]] as const) {
  test(`menu (${name}) : le logo est juste au-dessus des icônes, lisible dans chaque thème`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    await page.route('**/*', route => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/tests/fixtures/space-shell.html?many=1');
    if (width < 768) await page.locator('.mobile-tabbar').getByRole('button', { name: /Ouvrir le menu/ }).click();
    const logo = page.locator('.space-sidebar-logo');
    await logo.scrollIntoViewIfNeeded();
    for (const mode of ['light', 'dark', 'brand']) {
      await page.evaluate(value => {
        document.documentElement.classList.toggle('dark', value === 'dark');
        document.documentElement.setAttribute('data-sidebar', value === 'brand' && innerWidth >= 768 ? 'brand' : 'card');
      }, mode);
      const image = logo.locator('img:visible');
      await expect(image).toHaveCount(1);
      await expect(image).toHaveAttribute('src', mode === 'dark' ? /wide-dark/ : /wide-light/);
      await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      const box = (await image.boundingBox())!;
      const last = (await page.locator('.space-sidebar-card .space-menu-item').last().boundingBox())!;
      const home = (await page.locator('.space-sidebar-card').getByRole('button', { name: 'Accueil' }).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(last.y + last.height - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(home.y + 1);
      const card = (await page.locator('.space-sidebar-card').boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - card.x - card.width / 2)).toBeLessThanOrEqual(6);
    }
  });
}

for (const width of [360, 1440]) {
  test(`accueil : le bloc du client équilibre le logo GPDV (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, '/brand/gpdv-icon-192.png');
    const client = page.locator('.home-client');
    const logo = (await client.locator('img').boundingBox())!;
    expect(logo.height).toBeGreaterThanOrEqual(width < 640 ? 55 : 78);
    const name = client.getByText('Client test');
    expect(await name.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(width < 640 ? 20 : 30);
    const box = (await client.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
}
