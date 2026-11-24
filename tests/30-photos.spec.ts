import { test, expect, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

// Photos des tickets et des interventions. Base et stockage simulés : rien n'est lu ni écrit.
type Options = { missingColumn?: boolean; upload?: 'ok' | 'network' | 'refused' };
type Call = { method: string; path: string; body: any; size?: number };

/** PNG uni (grand, pour vérifier la réduction). */
const png = (width: number, height: number) => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer: Buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.alloc(1 + width * 3, 120); row[0] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
};
const file = (name = 'photo.png', width = 3000, height = 2000) => ({ name, mimeType: 'image/png', buffer: png(width, height) });
const picture = png(40, 30);

const open = async (page: Page, screen: string, { missingColumn = false, upload = 'ok' }: Options = {}) => {
  const calls: Call[] = [];
  const uploads: Call[] = [];
  const reads: string[] = [];
  const tickets = [
    { id: 1, code: 'INC-1', titre: 'Écran noir', categorie: 'terminal', priorite: 'haute', statut: 'ouvert', agence_nom: 'Gombe', createur_nom: 'Chef Test', created_at: new Date().toISOString(), photos: ['https://exemple.supabase.co/storage/v1/object/public/b/photos_tickets/a.jpg', 'https://exemple.supabase.co/storage/v1/object/public/b/photos_tickets/b.jpg', 'javascript:alert(1)'] },
    { id: 2, code: 'INC-2', titre: 'Sans photo', categorie: 'autre', priorite: 'normale', statut: 'ouvert', agence_nom: 'Gombe', created_at: new Date().toISOString() },
  ];
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname.includes('/storage/v1/object/')) {
      if (method === 'GET') return route.fulfill({ body: picture, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } });
      const isPhoto = /photos_(tickets|maintenance)/.test(url.pathname);
      if (isPhoto) {
        const size = request.postDataBuffer()?.length;
        uploads.push({ method, path: url.pathname, body: null, size });
        if (upload === 'network') return route.abort('internetdisconnected');
        if (upload === 'refused') return route.fulfill({ status: 403, json: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } });
      }
      return route.fulfill({ json: { Key: url.pathname.split('/object/')[1], path: url.pathname.split('/object/')[1] } });
    }
    const table = url.pathname.split('/').pop()!;
    if (method === 'GET') reads.push(url.pathname.split('/').pop() + decodeURIComponent(url.search));
    if (method !== 'GET') {
      const body = request.postDataJSON();
      calls.push({ method, path: table, body });
      const row = Array.isArray(body) ? body[0] : body;
      if (missingColumn && row?.photos && method === 'POST') {
        return route.fulfill({ status: 400, json: { code: 'PGRST204', message: "Could not find the 'photos' column of '" + table + "' in the schema cache" } });
      }
      const saved = { id: 99, ...row };
      const single = (request.headers().accept || '').includes('vnd.pgrst.object');
      return route.fulfill({ status: method === 'POST' ? 201 : 200, json: single ? saved : [saved] });
    }
    const rows: any[] = ({
      tickets_incidents: screen !== 'technicienTickets' ? tickets : url.search.includes('assigne_a_id')
        ? [{ ...tickets[1], id: 3, code: 'INC-3', titre: 'Assigné à Alice', assigne_a_id: '7', assigne_a_nom: 'Alice Test' }]
        : [{ ...tickets[1], id: 4, code: 'INC-4', titre: 'Signalé par Alice', createur_role: 'technicien', createur_id: '7' }],
      regions: [{ id: 'r1', nom: 'Kinshasa' }],
      agences: [{ id: 'a1', nom: 'Gombe', region: 'Kinshasa', codePDV: '001', nbreTerminaux: 2 }],
      terminaux: [{ id: 5, reference: 'TERM05', type_terminal: '2020', statut: 'Actif', agence_id: 'a1', imprimante_reference: 'IMP1' }],
      codes_interventions: [{ id: 3, code: 'P01', libelle: 'Nettoyage' }],
      codes_pannes: [{ id: 4, code: 'C01', libelle: 'Panne écran' }],
      chefs_agence: [{ id: 'c1', matricule: 'C1', nom: 'Chef', prenom: 'Paul', agenceEnCharge: 'Gombe', codePDV: '001', is_current: true }],
    } as Record<string, any[]>)[table] || [];
    const single = (request.headers().accept || '').includes('vnd.pgrst.object');
    return single && !rows.length ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } }) : route.fulfill({ json: single ? rows[0] : rows });
  });
  await page.goto(`/tests/fixtures/big-screens.html?screen=${screen}`);
  await page.waitForLoadState('networkidle');
  return { calls, uploads, reads };
};

const choose = async (page: Page, label: RegExp | string, option: RegExp | string) => {
  await page.getByRole('combobox', { name: label }).first().click();
  await page.getByRole('option', { name: option }).first().click();
};
const sign = async (page: Page, title: string) => {
  const block = page.locator('div').filter({ has: page.getByText(title, { exact: true }) }).filter({ has: page.locator('canvas') }).last();
  const canvas = block.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 5 });
  await page.mouse.move(box.x + 50, box.y + 55, { steps: 5 });
  await page.mouse.up();
  await block.getByRole('button', { name: /^Valider/ }).click();
};

test.describe('ticket', () => {
  const openDialog = async (page: Page) => {
    await page.getByRole('button', { name: 'Signaler un incident' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').first().fill('Terminal en panne');
    return dialog;
  };

  test('la photo est réduite, envoyée puis rattachée au ticket', async ({ page }) => {
    const { calls, uploads } = await open(page, 'ticket');
    const dialog = await openDialog(page);
    await dialog.locator('[data-photo-input="import"]').setInputFiles([file('a.png'), file('b.png', 800, 600)]);
    await expect(dialog.locator('img')).toHaveCount(2);
    await expect(dialog.getByText('2 / 4')).toBeVisible();
    await dialog.getByRole('button', { name: 'Retirer la photo 2' }).click();
    await expect(dialog.locator('img')).toHaveCount(1);
    const size = await dialog.locator('img').evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
    expect(size).toEqual([1600, 1067]);
    await dialog.getByRole('button', { name: 'Créer' }).click();
    await expect(dialog).toHaveCount(0);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toMatch(/photos_tickets\/\d{4}-\d{2}\/[\w-]+\.jpg$/);
    const created = calls.find(call => call.path === 'tickets_incidents')!;
    expect(created.body.photos).toHaveLength(1);
    expect(created.body.photos[0]).toMatch(/^https:\/\/.+\/photos_tickets\/.+\.jpg$/);
    // Le formulaire suivant repart sans photo.
    const next = await openDialog(page);
    await expect(next.locator('img')).toHaveCount(0);
  });

  test('sans photo, rien ne change dans l’enregistrement', async ({ page }) => {
    const { calls, uploads } = await open(page, 'ticket');
    const dialog = await openDialog(page);
    await dialog.getByRole('button', { name: 'Créer' }).click();
    await expect(dialog).toHaveCount(0);
    expect(uploads).toHaveLength(0);
    expect(calls.find(call => call.path === 'tickets_incidents')!.body).not.toHaveProperty('photos');
  });

  test('fichier refusé, limite de 4 photos', async ({ page }) => {
    await open(page, 'ticket');
    const dialog = await openDialog(page);
    const input = dialog.locator('[data-photo-input="import"]');
    await input.setInputFiles([{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('texte') }]);
    await expect(page.getByText("Ce fichier n'est pas une image.", { exact: true })).toBeVisible();
    await input.setInputFiles([{ name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('pas une image') }]);
    await expect(page.getByText(/n'a pas pu être lue/).first()).toBeVisible();
    await input.setInputFiles(Array.from({ length: 5 }, (_, i) => file(`${i}.png`, 60, 40)));
    await expect(dialog.locator('img')).toHaveCount(4);
    await expect(page.getByText('4 photos au maximum.', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Importer' })).toBeDisabled();
  });

  test('base pas encore à jour : le ticket est créé quand même, avec un avertissement', async ({ page }) => {
    const { calls } = await open(page, 'ticket', { missingColumn: true });
    const dialog = await openDialog(page);
    await dialog.locator('[data-photo-input="import"]').setInputFiles([file('a.png', 300, 200)]);
    await dialog.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(/base de données doit être mise à jour/).first()).toBeVisible();
    const posts = calls.filter(call => call.path === 'tickets_incidents');
    expect(posts).toHaveLength(2);
    expect(posts[1].body).not.toHaveProperty('photos');
  });

  test('envoi refusé par le serveur : le ticket est créé, l’échec est annoncé', async ({ page }) => {
    const { calls } = await open(page, 'ticket', { upload: 'refused' });
    const dialog = await openDialog(page);
    await dialog.locator('[data-photo-input="import"]').setInputFiles([file('a.png', 300, 200)]);
    await dialog.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(/n'ont pas pu être envoyées/).first()).toBeVisible();
    expect(calls.find(call => call.path === 'tickets_incidents')!.body).not.toHaveProperty('photos');
  });

  test('coupure réseau pendant l’envoi : la photo attend dans la file', async ({ page }) => {
    const { calls } = await open(page, 'ticket', { upload: 'network' });
    const dialog = await openDialog(page);
    await dialog.locator('[data-photo-input="import"]').setInputFiles([file('a.png', 300, 200)]);
    await dialog.getByRole('button', { name: 'Créer' }).click();
    await expect(page.getByText(/envoyées au retour de la connexion/).first()).toBeVisible();
    const photos = calls.find(call => call.path === 'tickets_incidents')!.body.photos;
    expect(photos).toHaveLength(1);
    const queue = await page.evaluate(() => new Promise<any[]>((resolve) => {
      const request = indexedDB.open('star3000-offline');
      request.onsuccess = () => { const all = request.result.transaction('queue').objectStore('queue').getAll(); all.onsuccess = () => resolve(all.result); };
    }));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ op: 'upload', type: 'photo' });
    expect(photos[0]).toContain(queue[0].upload.path);
    expect(queue[0].upload.fileBase64).toMatch(/^data:image\/jpeg;base64,/);
  });

  test('les photos s’affichent dans la liste et au traitement, seules les adresses web sont acceptées', async ({ page }) => {
    await open(page, 'ticket');
    const button = page.getByRole('button', { name: 'Voir 2 photo(s)' });
    await expect(button).toHaveCount(1);
    await button.click();
    const viewer = page.getByRole('dialog');
    await expect(viewer.getByText('Photo 1 sur 2')).toBeVisible();
    await viewer.getByRole('button', { name: 'Photo suivante' }).click();
    await expect(viewer.getByText('Photo 2 sur 2')).toBeVisible();
    await expect(viewer.locator('img')).toBeVisible();

    await open(page, 'traitement');
    await page.getByRole('row', { name: /INC-1/ }).getByRole('button', { name: 'Traiter' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /Agrandir la photo/ })).toHaveCount(2);
    await page.getByRole('button', { name: 'Agrandir la photo 2' }).click();
    await expect(page.getByText('Photo 2 sur 2')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('INC-1 — Écran noir')).toBeVisible();
  });
});

test('technicien : signale un incident avec photo, en choisissant l’agence et le terminal', async ({ page }) => {
  const { calls, uploads, reads } = await open(page, 'technicienTickets');
  // Ses tickets assignés se traitent ; ceux qu'il a seulement signalés se suivent ou s'annulent.
  await expect(page.getByRole('row', { name: /INC-3/ }).getByRole('button', { name: 'Traiter' })).toBeVisible();
  const own = page.getByRole('row', { name: /INC-4/ });
  await expect(own.getByRole('button', { name: 'Traiter' })).toHaveCount(0);
  await expect(own.locator('button[title="Annuler"]')).toBeVisible();
  expect(reads.some(read => read.includes('createur_role=eq.technicien') && read.includes('createur_id=eq.7'))).toBe(true);

  await page.getByRole('button', { name: 'Signaler un incident' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill('Afficheur cassé');
  await expect(dialog.getByText('Choisissez une agence pour voir ses terminaux.')).toBeVisible();
  await dialog.getByRole('combobox', { name: /Agence concernée/ }).click();
  await page.getByRole('option', { name: 'Gombe' }).click();
  await dialog.getByRole('combobox', { name: /Terminal concerné/ }).or(dialog.getByRole('combobox').filter({ hasText: 'Aucun' })).first().click();
  await page.getByRole('option', { name: 'TERM05' }).click();
  await dialog.locator('[data-photo-input="import"]').setInputFiles([file('a.png', 300, 200)]);
  await expect(dialog.locator('img')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog).toHaveCount(0);
  expect(uploads).toHaveLength(1);
  const { body } = calls.find(call => call.path === 'tickets_incidents')!;
  expect(body).toMatchObject({ createur_role: 'technicien', createur_id: 7, createur_nom: 'Alice Test', agence_nom: 'Gombe', terminal_reference: 'TERM05', terminal_kind: 'fixe', statut: 'ouvert' });
  expect(body.photos).toHaveLength(1);
});

test.describe('téléphone', () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test('« Prendre une photo » ouvre l’appareil photo, la fenêtre reste lisible', async ({ page }) => {
    await open(page, 'ticket');
    await page.getByRole('button', { name: 'Signaler un incident' }).tap();
    const dialog = page.getByRole('dialog');
    const camera = dialog.locator('[data-photo-input="camera"]');
    await expect(camera).toHaveAttribute('capture', 'environment');
    await expect(camera).toHaveAttribute('accept', 'image/*');
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Prendre une photo' }).tap();
    await (await chooser).setFiles(file('cliche.png', 900, 1600));
    await expect(dialog.locator('img')).toHaveCount(1);
    for (const name of ['Prendre une photo', 'Importer', 'Retirer la photo 1']) {
      const box = (await dialog.getByRole('button', { name }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(360);
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
      expect(box.height, 'sur une seule ligne').toBeLessThanOrEqual(40);
    }
    expect(await dialog.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test('ordinateur : pas de bouton appareil photo', async ({ page }) => {
  await open(page, 'ticket');
  await page.getByRole('button', { name: 'Signaler un incident' }).click();
  await expect(page.getByRole('button', { name: 'Importer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prendre une photo' })).toHaveCount(0);
});

for (const missingColumn of [false, true]) {
  test(`maintenance : photos jointes, gardées entre les étapes, dans la fiche${missingColumn ? ' (base pas à jour)' : ''}`, async ({ page }) => {
    const { calls, uploads } = await open(page, 'faire', { missingColumn });
    await choose(page, /Région/, 'Kinshasa');
    await choose(page, /Agence/, /Gombe/);
    await choose(page, /Terminal/, /TERM05/);
    await page.getByRole('radio', { name: /Préventive/ }).click();
    await page.getByRole('button', { name: /Suivant/ }).click();
    await page.getByRole('combobox').filter({ hasText: /code d'intervention|Choisir/ }).first().click();
    await page.getByRole('option', { name: /P01/ }).click();
    await page.locator('[data-photo-input="import"]').setInputFiles([file('a.png', 900, 600), file('b.png', 900, 600)]);
    await expect(page.getByRole('img', { name: 'Photo 2' })).toBeVisible();
    await page.getByRole('button', { name: /Passer aux signatures/ }).click();
    const joined = page.getByRole('list', { name: 'Photos jointes' }).getByRole('img');
    await expect(joined).toHaveCount(2);
    expect(await joined.first().evaluate((el: HTMLImageElement) => el.decode().then(() => el.naturalWidth))).toBe(900);
    // Retour en arrière : rien n'est perdu.
    await page.getByRole('button', { name: /Retour/ }).click();
    await expect(page.getByRole('img', { name: /^Photo/ })).toHaveCount(2);
    await page.getByRole('button', { name: /Passer aux signatures/ }).click();
    await sign(page, 'Signature du technicien');
    await sign(page, "Signature du chef d'agence");
    await page.getByRole('button', { name: 'Enregistrer la validation' }).click();
    await expect(page.getByText(/Intervention Terminée/)).toBeVisible();

    expect(uploads).toHaveLength(2);
    expect(uploads.every(call => call.path.includes('photos_maintenance/'))).toBe(true);
    const inserts = calls.filter(call => call.path === 'interventions_maintenance' && call.method === 'POST');
    const row = (call: Call) => (Array.isArray(call.body) ? call.body[0] : call.body);
    expect(row(inserts[0]).photos).toHaveLength(2);
    if (missingColumn) {
      expect(inserts).toHaveLength(2);
      expect(row(inserts[1])).not.toHaveProperty('photos');
      await expect(page.getByRole('status').filter({ hasText: 'mise à jour' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Agrandir la photo/ })).toHaveCount(0);
    } else {
      expect(inserts).toHaveLength(1);
      await expect(page.getByRole('button', { name: /Agrandir la photo/ })).toHaveCount(2);
    }
  });
}

test('retour en ligne : la photo part, et une base pas à jour ne bloque pas l’intervention', async ({ page }) => {
  const { calls, uploads } = await open(page, 'ticket', { missingColumn: true });
  const left = await page.evaluate(async () => {
    const url = (name: string) => performance.getEntriesByType('resource').map(entry => entry.name).find(entry => entry.includes(name)) || `/src/lib/${name}`;
    const queue = await import(/* @vite-ignore */ url('offlineQueue.js'));
    const sync = await import(/* @vite-ignore */ url('offlineSync.js'));
    await queue.enqueueOffline({ type: 'photo', op: 'upload', upload: { bucket: 'b', path: 'photos_maintenance/2026-11/x.jpg', fileBase64: 'data:image/jpeg;base64,AAAA', contentType: 'image/jpeg' } });
    await queue.enqueueOffline({ type: 'maintenance', table: 'interventions_maintenance', payload: { terminal_id: 5, photos: ['https://exemple/x.jpg'] } });
    await sync.flushQueue();
    return queue.countQueued();
  });
  expect(left).toBe(0);
  expect(uploads.map(call => call.path)).toEqual([expect.stringContaining('photos_maintenance/2026-11/x.jpg')]);
  const inserts = calls.filter(call => call.path === 'interventions_maintenance');
  expect(inserts).toHaveLength(2);
  expect(inserts[1].body).not.toHaveProperty('photos');
});
