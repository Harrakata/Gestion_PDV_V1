import { test, expect, type Page } from '@playwright/test';

// Écrans denses : texte minimum, contraste et débordement. Toutes les requêtes vers
// Supabase sont interceptées : aucune donnée lue ni écrite.
const SCREENS = ['salaire', 'tableau', 'centre', 'mobi', 'parametres', 'formule', 'reparation', 'pieces', 'planning', 'technicien', 'chronologie', 'signature'];
const MIN_TEXT = 12;

const stock = ['defectueux', 'assigne', 'a_tester'].map((statut, i) => ({
  id: `s${i}`, reference_sous_ensemble: `IMP00${i}`, type_sous_ensemble: 'imprimante', type_terminal: '2020', statut,
  technicien_id: 't1', date_entree: '2026-11-01T10:00:00Z', agence: { nom: 'Agence test' },
}));
const agences = [{ id: 'a1', nom: 'Agence test', region: 'Nord', secteur: 'Secteur test', codePDV: '001', nbreTerminaux: 2, is_current: true }];

const open = async (page: Page, screen: string, dark = false) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\//, route => {
    const url = route.request().url();
    const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
    const rows = url.includes('/stock_defectueux') ? stock : url.includes('/agences?') ? agences : [];
    return single && rows.length === 0
      ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } })
      : route.fulfill({ json: single ? rows[0] : rows });
  });
  await page.goto(`/tests/fixtures/big-screens.html?screen=${screen}${dark ? '&dark=1' : ''}`);
  await expect(page.locator('#main-content')).toContainText(/\S/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(700); // animations d'apparition
  return errors;
};

const inspect = (page: Page, dark: boolean) => page.evaluate(([isDark, minText]) => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const rgba = (color: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top: number[], base: number[]) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3]));
  const lum = (c: number[]) => c.map(v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const small: string[] = [];
  const faint: string[] = [];
  let total = 0;
  const walker = document.createTreeWalker(document.querySelector('#main-content')!, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent!.trim();
    const el = walker.currentNode.parentElement!;
    if (!text || el instanceof SVGElement || el.closest('script, style, svg, .sr-only, [disabled], [aria-disabled="true"], .opacity-50, [data-on-canvas]')) continue;
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (box.width < 2 || !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    total += 1;
    const size = parseFloat(style.fontSize);
    // En-têtes de colonnes : exception assumée (majuscules), plancher de 10 px.
    if (size < (el.closest('thead th') ? 10 : minText) - 0.05) small.push(`${size}px « ${text.slice(0, 30)} »`);
    const layers: number[][] = [];
    let gradient = false;
    let opacity = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      opacity *= Number(s.opacity);
      if (s.backgroundImage.includes('gradient')) gradient = true;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] > 0.999) break;
    }
    if (gradient || opacity < 0.95) continue;
    let bg = isDark ? [15, 23, 42] : [255, 255, 255];
    while (layers.length) bg = over(layers.pop()!, bg);
    const [a, b] = [lum(over(rgba(style.color), bg)), lum(bg)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) faint.push(`${ratio.toFixed(2)} « ${text.slice(0, 30)} » ${String(el.className).slice(0, 90)}`);
  }
  return { total, small: [...new Set(small)], faint: [...new Set(faint)], overflow: document.documentElement.scrollWidth - window.innerWidth };
}, [dark, MIN_TEXT] as const);

for (const screen of SCREENS) {
  test(`${screen} : texte de 12 px au moins et contraste AA, en clair comme en sombre`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const dark of [false, true]) {
      const errors = await open(page, screen, dark);
      const result = await inspect(page, dark);
      expect(errors).toEqual([]);
      expect(result.total).toBeGreaterThan(1);
      expect.soft(result.small, `texte, ${dark ? 'sombre' : 'clair'}`).toEqual([]);
      expect.soft(result.faint, `contraste, ${dark ? 'sombre' : 'clair'}`).toEqual([]);
    }
  });

  test(`${screen} : 360 px, texte de 12 px même en taille Compacte, sans débordement`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await open(page, screen);
    for (const size of [16, 14]) {
      await page.evaluate(value => { document.documentElement.style.fontSize = `${value}px`; }, size);
      const result = await inspect(page, false);
      expect.soft(result.small, `racine ${size}px`).toEqual([]);
      expect.soft(result.overflow, `débordement, racine ${size}px`).toBeLessThanOrEqual(0);
    }
  });
}

test('la signature s’écrit toujours sur fond blanc', async ({ page }) => {
  await open(page, 'signature', true);
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(page.locator('canvas')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
