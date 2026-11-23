import { test, expect, type Page } from '@playwright/test';

// Fenêtre « Composition » d'un modèle. Données simulées : rien n'est lu ni écrit en base.
const names = ['SQUELETTE AFFICHEUR CLIENT', 'CAPOT SUP', 'FERRITE', 'FILTRE AFFICHEUR', 'JOINT D’ETANCHEITE DE LA FACE AVANT', 'LIAISON CETX-AFFICHEUR', 'CAPOT INF', 'VIS M3', 'CARTE AFFICHEUR'];
const photo = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="900" height="700"><rect width="900" height="700" fill="teal"/></svg>';
const open = async (page: Page, count = names.length) => {
  const writes: string[] = [];
  const pieces = names.map((nom, i) => ({ id: `p${i}`, nom, reference: `PMC2951${i}A500`, sous_ensemble: 'afficheur', type_terminal: 'tous', photo_url: i === 1 ? photo : null }));
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, route => {
    const url = route.request().url();
    const method = route.request().method();
    if (method !== 'GET') { writes.push(`${method} ${new URL(url).pathname.split('/').pop()}`); return route.fulfill({ json: [] }); }
    const rows = /\/modeles_sous_ensembles\?/.test(url) ? [{ id: 'm1', nom: 'AFFI_CLT01', sous_ensemble: 'afficheur', type_terminal: 'tous' }]
      : /\/modeles_pieces\?/.test(url) ? pieces.slice(0, count).map((piece, i) => ({ id: `mp${i}`, modele_id: 'm1', piece_id: piece.id, quantite: 1, piece }))
        : /\/pieces_sous_ensembles\?/.test(url) ? pieces : [];
    return route.fulfill({ json: rows });
  });
  await page.goto('/tests/fixtures/big-screens.html?screen=pieces');
  await page.waitForLoadState('networkidle');
  await page.getByRole('tab', { name: 'Modèles' }).click();
  await page.getByRole('button', { name: 'Composition', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('list', { name: 'Pièces du modèle' })).toBeVisible();
  await page.waitForTimeout(400);
  return { dialog, writes };
};

const fits = async (page: Page) => {
  const result = await page.getByRole('dialog').evaluate(el => {
    const box = el.getBoundingClientRect();
    const out = [...el.querySelectorAll<HTMLElement>('*')].filter(node => node.checkVisibility() && !node.closest('.sr-only, svg')).filter(node => {
      const r = node.getBoundingClientRect();
      return r.width > 2 && (r.right > box.right + 1 || r.left < box.left - 1);
    }).map(node => node.tagName + ' ' + node.textContent!.slice(0, 30));
    return { out, scroll: el.scrollWidth - el.clientWidth, top: box.top, bottom: box.bottom, left: box.left, right: box.right, w: innerWidth, h: innerHeight };
  });
  expect(result.out).toEqual([]);
  expect(result.scroll).toBeLessThanOrEqual(0);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.bottom).toBeLessThanOrEqual(result.h);
  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.w);
};

test.describe('téléphone', () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  for (const [width, height] of [[320, 568], [360, 640], [412, 892], [360, 380]]) {
    test(`tout tient dans la fenêtre (${width}×${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const { dialog } = await open(page);
      await fits(page);
      // La croix reste dans l'en-tête et le titre n'est pas rogné.
      const header = (await dialog.locator('.app-dialog-close').boundingBox())!;
      expect(header.y + header.height).toBeLessThanOrEqual((await dialog.getByRole('list', { name: 'Pièces du modèle' }).boundingBox())!.y);
      const title = dialog.getByText('Composition : AFFI_CLT01');
      expect(await title.evaluate(el => el.clientHeight - parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(6);
      // L'ajout reste visible sans défiler la fenêtre ; seule la liste défile.
      const add = (await dialog.getByRole('button', { name: 'Ajouter' }).boundingBox())!;
      const box = (await dialog.boundingBox())!;
      expect(add.y + add.height).toBeLessThanOrEqual(box.y + box.height);
      expect(add.x + add.width).toBeLessThanOrEqual(box.x + box.width);
      const list = dialog.getByRole('list', { name: 'Pièces du modèle' });
      expect(await list.evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(60);
      const last = dialog.getByRole('button', { name: /^CARTE AFFICHEUR/ });
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
    });
  }

  test('noms entiers, aperçu ouvert sous la pièce puis refermé', async ({ page }) => {
    const { dialog } = await open(page);
    await expect(dialog.getByText('Sélectionnez une pièce')).toHaveCount(0);
    for (const name of names) {
      const text = dialog.getByText(name, { exact: true });
      expect(await text.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && getComputedStyle(el).textOverflow !== 'ellipsis')).toBe(true);
    }
    const row = dialog.getByRole('button', { name: /^CAPOT SUP/ });
    await row.tap();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    const image = (await dialog.getByRole('img', { name: 'CAPOT SUP' }).boundingBox())!;
    const box = (await row.boundingBox())!;
    expect(image.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
    await fits(page);
    await row.tap();
    await expect(dialog.getByRole('img', { name: 'CAPOT SUP' })).toHaveCount(0);
  });

  test('peu de pièces : fenêtre à la hauteur du contenu', async ({ page }) => {
    const { dialog } = await open(page, 2);
    expect((await dialog.boundingBox())!.height).toBeLessThan(400);
    await fits(page);
  });

  test('ajouter exige une pièce, retirer ne change pas la sélection', async ({ page }) => {
    const { dialog, writes } = await open(page);
    await expect(dialog.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
    await dialog.getByRole('combobox').tap();
    await page.getByRole('option', { name: /FERRITE/ }).tap();
    await dialog.getByLabel('Qté').fill('3');
    await dialog.getByRole('button', { name: 'Ajouter' }).tap();
    await expect.poll(() => writes).toEqual(['POST modeles_pieces']);
    await dialog.getByRole('button', { name: 'Retirer FERRITE' }).tap();
    await expect.poll(() => writes).toEqual(['POST modeles_pieces', 'DELETE modeles_pieces']);
    await expect(dialog.locator('[aria-expanded="true"]')).toHaveCount(0);
  });
});

test('ordinateur : liste et aperçu côte à côte', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { dialog } = await open(page);
  await expect(dialog.getByText('Sélectionnez une pièce')).toBeVisible();
  await dialog.getByRole('button', { name: /^CAPOT SUP/ }).click();
  const image = (await dialog.getByRole('img', { name: 'CAPOT SUP' }).boundingBox())!;
  const list = (await dialog.getByRole('list', { name: 'Pièces du modèle' }).boundingBox())!;
  expect(image.x).toBeGreaterThanOrEqual(list.x + list.width - 1);
  await fits(page);
});
