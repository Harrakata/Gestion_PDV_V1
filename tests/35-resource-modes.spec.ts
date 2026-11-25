import { test, expect, type Page } from '@playwright/test';
import { EXPLOITATION_ACCESS_LEVELS, EXPLOITATION_MENU_PERMISSIONS } from '../src/lib/exploitationProfiles.js';
import { simulateBackend, type Account, type Row } from './helpers/simulatedBackend';

// Modes de ressources (Dev, Démo, Prod) et notifications push, dans l'application complète, sur
// une base simulée. Le serveur de test impose Prod ; chaque test choisit son mode sur l'appareil.
type Mode = 'dev' | 'demo' | 'prod';
const account = (id: string): Account => ({ id: `auth-${id}`, email: `${id}@exemple.test`, password: 'motdepasse-test' });
const permissions = Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path }: any) => [path, EXPLOITATION_ACCESS_LEVELS.WRITE]));
const person = (id: string, extra: Row = {}): Row => ({ id: `${id}-1`, nom: 'Diallo', prenom: 'Awa', email: `${id}@exemple.test`, matricule: `M-${id}`, auth_user_id: `auth-${id}`, is_current: true, statut: 'Actif', ...extra });
const base: Record<string, Row[]> = {
  app_settings: [{ id: 1, key: 'general', value: { sessionDureeMinutes: 6000 } }], // pas de déconnexion automatique pendant la mesure
  agences: [{ id: 'a1', nom: 'Gombe', region: 'Nord', secteur: 'Secteur 1', codePDV: '001', is_current: true, statut: 'Actif' }],
  regions: [{ id: 'r1', nom: 'Nord' }],
  secteurs: [{ id: 's1', nom: 'Secteur 1', region: 'Nord', code: 'S1' }],
  profils_exploitation: [person('exploitation', { permissions })],
  guichetieres: [person('guichetiere', { agenceAssigne: 'Gombe', codePrepose: 'P1' }), person('autre', { agenceAssigne: 'Gombe', codePrepose: 'P2', nom: 'Traoré' })],
};
const SPACES = { exploitation: '/espace-exploitation', guichetiere: '/espace-guichetiere' };

const menuOf = (page: Page) => page.getByRole('navigation', { name: /^Menu · / });
const bell = (page: Page) => page.getByRole('button', { name: /notification/i }).first();
const open = async (page: Page, id: keyof typeof SPACES, mode: Mode, { tables = {} as Record<string, Row[]>, realtime = true, path = '' } = {}) => {
  await page.addInitScript(value => { if (!sessionStorage.getItem('mode-set')) { localStorage.setItem('resource_mode_device', value); sessionStorage.setItem('mode-set', '1'); } }, mode);
  const backend = await simulateBackend(page, { accounts: [account(id)], tables: { ...base, ...tables }, realtime });
  await page.clock.install();
  await page.goto(path || SPACES[id]);
  await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(`${id}@exemple.test`);
  await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
  await page.locator('main form button[type="submit"], form button[type="submit"]').first().click();
  await expect(menuOf(page)).toBeVisible();
  await backend.settle();
  return backend;
};
const advance = async (page: Page, minutes: number) => {
  for (let done = 0; done < minutes; done += 1) {
    for (let i = 0; i < 2; i += 1) { await page.clock.runFor(30_000); await page.waitForTimeout(25); }
  }
  await page.waitForTimeout(150);
};
const setHidden = (page: Page, hidden: boolean) => page.evaluate(value => {
  Object.defineProperty(document, 'visibilityState', { get: () => (value ? 'hidden' : 'visible'), configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

test.describe('Volume par mode, une heure sans action', () => {
  test.setTimeout(180_000);

  // Plafonds : lectures et écritures automatiques d'un écran ouvert pendant une heure.
  for (const [id, mode, reads, writes] of [
    ['exploitation', 'dev', 14, 4],
    ['exploitation', 'demo', 25, 15],
    ['guichetiere', 'dev', 8, 4],
    ['guichetiere', 'demo', 14, 15],
  ] as const) {
    test(`${id} en mode ${mode}`, async ({ page }) => {
      const backend = await open(page, id, mode);
      expect(backend.listened().length > 0).toBe(mode !== 'dev');
      const [readsBefore, writesBefore] = [backend.reads.length, backend.allWrites.length];
      await advance(page, 60);
      const seen = backend.reads.slice(readsBefore);
      expect(seen.length, seen.join()).toBeLessThanOrEqual(reads);
      const written = backend.allWrites.slice(writesBefore).map(write => write.table);
      expect(written.length, written.join()).toBeLessThanOrEqual(writes);
      expect(backend.errors).toEqual([]);

      // En arrière-plan : plus aucun signal de présence, et plus aucune lecture en Dev.
      await setHidden(page, true);
      const [readsHidden, writesHidden] = [backend.reads.length, backend.allWrites.length];
      await advance(page, 60);
      expect(backend.allWrites.slice(writesHidden).map(write => write.table)).toEqual([]);
      if (mode === 'dev') expect(backend.reads.slice(readsHidden)).toEqual([]);
    });
  }
});

test.describe('Fonctionnement en mode Dev', () => {
  const message = (id: number): Row => ({ id, titre: `Consigne ${id}`, corps: 'Texte', categorie: 'info', destinataires: 'guichetiere', actif: true, created_at: '2026-11-24T09:00:00Z' });

  test('ouvrir la cloche montre le nouveau message', async ({ page }) => {
    const messages: Row[] = [];
    const backend = await open(page, 'guichetiere', 'dev', { tables: { messages_exploitation: messages } });
    messages.push(message(1));
    await page.clock.runFor(11_000);
    const start = backend.reads.length;
    await bell(page).click();
    await expect(page.getByText("Message(s) de l'exploitation").first()).toBeVisible();
    expect(backend.reads.slice(start).filter(table => table === 'messages_exploitation')).toHaveLength(1);
  });

  test('revenir sur l’application montre le nouveau message', async ({ page }) => {
    const messages: Row[] = [];
    await open(page, 'guichetiere', 'dev', { tables: { messages_exploitation: messages } });
    await setHidden(page, true);
    await advance(page, 5);
    messages.push(message(1));
    await setHidden(page, false);
    await page.clock.runFor(1000);
    await expect(bell(page)).toContainText('1');
  });

  test('le journal de navigation n’est pas alimenté, la connexion l’est', async ({ page }) => {
    const backend = await open(page, 'guichetiere', 'dev');
    await expect.poll(() => backend.allWrites.filter(write => write.table === 'activites_evenements').map(write => write.body.event_type)).toEqual(['login']);
    await menuOf(page).getByText('Mes Pointages', { exact: true }).first().click();
    await backend.settle();
    await advance(page, 2);
    expect(backend.allWrites.filter(write => write.table === 'activites_evenements')).toHaveLength(1);
  });
});

test('mode Démo : navigations regroupées, et envoyées à la déconnexion', async ({ page }) => {
  const backend = await open(page, 'guichetiere', 'demo');
  const events = () => backend.allWrites.filter(write => write.table === 'activites_evenements').map(write => write.body);
  await expect.poll(() => events().length).toBe(1); // connexion
  for (const label of ['Mes Pointages', "Demandes d'absence"]) {
    await menuOf(page).getByText(label, { exact: true }).first().click();
    await backend.settle();
  }
  expect(events()).toHaveLength(1);
  await advance(page, 1);
  expect(events()).toHaveLength(2);
  expect(events()[1].map((event: Row) => event.event_type)).toEqual(['navigation', 'navigation']);
  expect(new Set(events()[1].map((event: Row) => Object.keys(event).join())).size).toBe(1);

  await menuOf(page).getByText('Mon Planning', { exact: true }).first().click();
  await backend.settle();
  await page.getByRole('button', { name: 'Déconnexion' }).first().click();
  await expect(menuOf(page)).toHaveCount(0);
  await expect.poll(() => events().flat().map((event: Row) => event.event_type).sort()).toEqual(['login', 'logout', 'navigation', 'navigation', 'navigation']);
  // La session est close, avec sa dernière navigation, et rien ne la rouvre ensuite.
  await advance(page, 10);
  const sessions = backend.allWrites.filter(write => write.table === 'activites_sessions' && write.method === 'PATCH');
  expect(sessions.at(-1)!.body).toMatchObject({ nav_count: 3, ended_at: expect.any(String) });
});

for (const [id, mode] of [['exploitation', 'prod'], ['guichetiere', 'prod'], ['exploitation', 'demo'], ['guichetiere', 'dev']] as const) {
  test(`la déconnexion est enregistrée : ${id} en mode ${mode}`, async ({ page }) => {
    const backend = await open(page, id, mode);
    await page.getByRole('button', { name: 'Déconnexion' }).first().click();
    await expect(menuOf(page)).toHaveCount(0);
    const types = () => backend.allWrites.filter(write => write.table === 'activites_evenements').flatMap(write => [write.body].flat()).map(event => event.event_type);
    await expect.poll(() => types().filter(type => type === 'logout').length).toBe(1);
    await advance(page, 5);
    expect(types().filter(type => type === 'logout')).toHaveLength(1);
    expect(backend.allWrites.filter(write => write.table === 'activites_sessions' && write.method === 'PATCH').at(-1)!.body.ended_at).toBeTruthy();
  });
}

test('au démarrage, les réglages sont lus en une seule requête', async ({ page }) => {
  const queries: string[] = [];
  page.on('request', request => { if (request.method() === 'GET' && request.url().includes('/rest/v1/app_settings')) queries.push(decodeURIComponent(request.url().split('?')[1])); });
  await simulateBackend(page, { accounts: [], tables: base });
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect.poll(() => queries.length).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(queries).toHaveLength(1);
  for (const key of ['app_language', 'theme_colors', 'functionalites_espaces', 'client_branding', 'resource_mode']) expect(queries[0]).toContain(key);
});

test.describe('Choix du mode', () => {
  const SECTION = /^Mode de ressources/;
  const openSection = async (page: Page) => {
    await page.getByRole('button', { name: SECTION }).click();
    return page.locator(`[id="${await page.getByRole('button', { name: SECTION }).getAttribute('aria-controls')}"]`);
  };

  test('mode imposé par le déploiement : pas de choix pour tous, mais un essai sur l’appareil', async ({ page }) => {
    const backend = await open(page, 'exploitation', 'prod', { path: '/espace-exploitation/parametres' });
    const panel = await openSection(page);
    await expect(panel.getByText('Imposé par ce déploiement : Prod')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Enregistrer le mode' })).toHaveCount(0);
    await panel.getByRole('radiogroup', { name: 'Mode sur cet appareil' }).getByRole('radio', { name: 'Dev' }).click();
    await expect(page.getByRole('button', { name: SECTION })).toHaveAttribute('aria-expanded', 'false'); // page rechargée
    const reopened = await openSection(page);
    await expect(reopened.getByText(/Mode actif sur cet appareil/)).toContainText('Dev');
    expect(backend.writes()).toEqual([]);
    expect(backend.errors).toEqual([]);
  });

  test('choix du client : appliqué au premier lancement, modifiable dans Paramètres', async ({ page }) => {
    // Déploiement qui n'impose rien.
    await page.route(/\/src\/lib\/resourceMode\.js/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('import.meta.env?.VITE_RESOURCE_MODE', "''") });
    });
    const setting: Row = { id: 9, key: 'resource_mode', value: { mode: 'demo' } };
    const backend = await simulateBackend(page, { accounts: [account('exploitation')], tables: { ...base, app_settings: [...base.app_settings, setting] } });
    page.on('request', request => {
      if (request.method() === 'PATCH' && request.url().includes('/app_settings?id=eq.9')) setting.value = request.postDataJSON().value;
    });
    await page.goto('/espace-exploitation/parametres');
    // Aucun choix mémorisé : le mode du client est lu puis appliqué (un rechargement).
    await expect.poll(() => page.evaluate(() => localStorage.getItem('resource_mode_client')).catch(() => null)).toBe('demo');
    await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill('exploitation@exemple.test');
    await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
    await page.locator('form button[type="submit"]').first().click();
    await expect(menuOf(page)).toBeVisible();
    await backend.settle();

    const panel = await openSection(page);
    const modes = panel.getByRole('radiogroup', { name: 'Mode de ressources' });
    await expect(modes.getByRole('radio', { name: 'Démo' })).toHaveAttribute('aria-checked', 'true');
    await expect(panel.getByText(/Mode actif sur cet appareil/)).toContainText('Démo');
    await expect(panel.getByRole('button', { name: 'Enregistrer le mode' })).toBeDisabled();
    await modes.getByRole('radio', { name: 'Prod' }).click();
    await expect(page.getByText('Non enregistré')).toBeVisible();
    await panel.getByRole('button', { name: 'Enregistrer le mode' }).click();
    await expect(page.getByRole('button', { name: SECTION })).toHaveAttribute('aria-expanded', 'false'); // page rechargée
    await backend.settle();
    const reopened = await openSection(page);
    await expect(reopened.getByText(/Mode actif sur cet appareil/)).toContainText('Prod');
    expect(backend.writes().filter(write => write.table === 'app_settings').map(write => write.body)).toEqual([{ value: { mode: 'prod' } }]);
    expect(backend.errors).toEqual([]);
  });

  test('profil en lecture seule : mode affiché, sans choix pour tous', async ({ page }) => {
    await page.route(/\/src\/lib\/resourceMode\.js/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('import.meta.env?.VITE_RESOURCE_MODE', "''") });
    });
    const tables = { profils_exploitation: [person('exploitation', { permissions: { ...permissions, parametres: EXPLOITATION_ACCESS_LEVELS.READ } })], app_settings: [...base.app_settings, { id: 9, key: 'resource_mode', value: { mode: 'prod' } }] };
    await open(page, 'exploitation', 'demo', { path: '/espace-exploitation/parametres', tables });
    const panel = await openSection(page);
    await expect(panel.getByText('Réactivité maximale', { exact: false })).toBeVisible();
    await expect(panel.getByRole('radiogroup', { name: 'Mode de ressources' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Enregistrer le mode' })).toHaveCount(0);
    await expect(panel.getByRole('radiogroup', { name: 'Mode sur cet appareil' })).toBeVisible();
  });

  test('le tableau compare les trois modes', async ({ page }) => {
    await open(page, 'exploitation', 'demo', { path: '/espace-exploitation/parametres' });
    const panel = await openSection(page);
    const cells = (name: string) => panel.getByRole('row', { name: new RegExp(`^${name}`) }).getByRole('cell').allTextContents();
    expect(await cells('Temps réel')).toEqual(['Non', 'Oui', 'Oui']);
    expect(await cells('Actualisation sans temps réel')).toEqual(['30 min', '3 min', '1 min']);
    expect(await cells('Signal de présence')).toEqual(['15 min', '5 min', '2 min']);
    expect(await cells('Taille des photos')).toEqual(['1024 px', '1280 px', '1600 px']);
  });

  test('sur téléphone, la section tient dans l’écran', async ({ page }) => {
    await open(page, 'exploitation', 'demo', { path: '/espace-exploitation/parametres' });
    await page.setViewportSize({ width: 360, height: 780 });
    const panel = await openSection(page);
    await expect(panel).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // Les trois colonnes se comparent sans défilement.
    expect(await panel.getByRole('table').evaluate(table => table.scrollWidth - table.parentElement!.clientWidth)).toBeLessThanOrEqual(0);
  });
});

test.describe('Conservation des journaux d’activité', () => {
  const SECTION = /^Mode de ressources/;
  const ago = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const logs = {
    activites_sessions: [1, 20, 45, 200].map((days, id) => ({ id, space_key: 'espace-guichetiere', user_key: `u${id}`, started_at: ago(days), last_seen_at: ago(days) })),
    activites_evenements: [1, 45, 46, 200, 201].map((days, id) => ({ id, event_type: 'navigation', created_at: ago(days) })),
  };
  const openRetention = async (page: Page, settings: Row[], profile?: Row) => {
    const tables: Record<string, Row[]> = { ...logs, app_settings: [...base.app_settings, ...settings] };
    if (profile) tables.profils_exploitation = [profile];
    const backend = await open(page, 'exploitation', 'demo', { path: '/espace-exploitation/parametres', tables });
    await page.getByRole('button', { name: SECTION }).click();
    return { backend, choice: page.getByRole('radiogroup', { name: 'Conservation des journaux d\'activité' }), saved: () => backend.writes().filter(write => write.table === 'app_settings').map(write => write.body) };
  };
  const installed = (value: Row = { scheduled: true }) => ({ id: 20, key: 'activity_purge_status', value });

  test('activer la purge annonce ce qui sera supprimé ; annuler ne change rien', async ({ page }) => {
    const { choice, saved, backend } = await openRetention(page, [installed()]);
    await expect(choice.getByRole('radio', { name: 'Tout' })).toHaveAttribute('aria-checked', 'true');
    await choice.getByRole('radio', { name: '30 jours' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('2 connexion(s) et 4 évènement(s) de plus de 30 jours');
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(choice.getByRole('radio', { name: 'Tout' })).toHaveAttribute('aria-checked', 'true');
    expect(saved()).toEqual([]);

    await choice.getByRole('radio', { name: '30 jours' }).click();
    await dialog.getByRole('button', { name: 'Activer la purge' }).click();
    await expect(choice.getByRole('radio', { name: '30 jours' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Première purge la nuit prochaine.')).toBeVisible();
    expect(saved()).toEqual([{ key: 'activity_retention', value: { days: 30 } }]);
    // L'application ne supprime jamais elle-même.
    expect(backend.allWrites.filter(write => write.method === 'DELETE')).toEqual([]);
    expect(backend.errors).toEqual([]);
  });

  test('conserver plus longtemps ne demande pas de confirmation', async ({ page }) => {
    const { choice, saved } = await openRetention(page, [installed({ scheduled: true, at: ago(0), days: 30, sessions: 1200, events: 8 }), { id: 21, key: 'activity_retention', value: { days: 30 } }]);
    await expect(page.getByText(/Dernière purge : .*, 1\s200 connexion\(s\) et 8 évènement\(s\) supprimé\(s\)/)).toBeVisible();
    await choice.getByRole('radio', { name: '90 jours' }).click();
    await expect(choice.getByRole('radio', { name: '90 jours' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(saved()).toEqual([{ value: { days: 90 } }]);
  });

  test('purge non installée ou non planifiée : signalée', async ({ page }) => {
    const { choice } = await openRetention(page, []);
    await expect(page.getByText('Purge non installée sur cette base')).toBeVisible();
    await expect(choice).toHaveCount(0);
  });

  test('extension absente : signalée', async ({ page }) => {
    const { choice } = await openRetention(page, [installed({ scheduled: false })]);
    await expect(page.getByText('Purge non planifiée')).toBeVisible();
    await expect(choice).toBeVisible();
  });

  test('profil en lecture seule : durée affichée, sans choix', async ({ page }) => {
    const readOnly = { ...permissions, parametres: EXPLOITATION_ACCESS_LEVELS.READ };
    const { choice, saved } = await openRetention(page, [installed(), { id: 21, key: 'activity_retention', value: { days: 90 } }], person('exploitation', { permissions: readOnly }));
    await expect(page.getByText('Première purge la nuit prochaine.')).toBeVisible();
    await expect(choice).toHaveCount(0);
    expect(saved()).toEqual([]);
  });

  test('écran Activités : pas de période plus longue que la conservation', async ({ page }) => {
    await open(page, 'exploitation', 'demo', { path: '/espace-exploitation/activites-et-audit', tables: { ...logs, app_settings: [...base.app_settings, { id: 21, key: 'activity_retention', value: { days: 30 } }] } });
    await expect(page.getByText(/Historique conservé/)).toContainText('30 jours');
    await page.getByRole('combobox').filter({ hasText: '7 derniers jours' }).click();
    await expect(page.getByRole('option', { name: '30 derniers jours' })).toBeVisible();
    await expect(page.getByRole('option', { name: '90 derniers jours' })).toHaveCount(0);
  });
});

test.describe('Listes longues', () => {
  test('900 demandes : toutes les lignes sont affichées en moins d’une seconde', async ({ page }) => {
    test.setTimeout(60_000);
    const demandes = Array.from({ length: 900 }, (_, index) => ({ id: index + 1, codeDemande: `PG-${String(index + 1).padStart(4, '0')}`, montantGain: 1000 + index, statutGlobal: 'En attente exploitation', niveauValidationCourant: 'exploitation', agenceOrigineNom: 'Gombe', created_at: '2026-11-24T08:00:00Z', updated_at: '2026-11-24T08:00:00Z' }));
    await page.addInitScript(() => localStorage.setItem('resource_mode_device', 'demo'));
    const backend = await simulateBackend(page, { accounts: [account('exploitation')], tables: { ...base, demandes_paiement_gain: demandes } });
    await page.goto('/espace-exploitation/autorisation-paiement-gain');
    await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill('exploitation@exemple.test');
    await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
    await page.locator('form button[type="submit"]').first().click();
    const rows = page.locator('tbody tr').filter({ hasText: 'PG-' });
    await expect(rows).toHaveCount(900, { timeout: 30_000 });
    await page.waitForTimeout(1000);
    const hidden = await rows.evaluateAll(list => list.filter(row => Number(getComputedStyle(row).opacity) < 0.99).length);
    expect(hidden).toBe(0);
    expect(backend.errors).toEqual([]);
  });
});

test('photos allégées avant l’envoi, autres fichiers intacts', async ({ page }) => {
  await simulateBackend(page, { accounts: [], tables: base });
  await page.goto('/');
  const sizes = await page.evaluate(async () => {
    const { lightenPortrait, lightenDocument } = await import(/* @vite-ignore */ '/src/lib/photos.js' as string);
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = [3000, 2000];
    const context = canvas.getContext('2d')!;
    for (let i = 0; i < 4000; i += 1) { context.fillStyle = `hsl(${(i * 37) % 360} 60% 50%)`; context.fillRect((i * 97) % 3000, (i * 61) % 2000, 60, 60); }
    const blob: Blob = await new Promise(resolve => { canvas.toBlob(value => resolve(value!), 'image/jpeg', 0.95); });
    const photo = new File([blob], 'IMG_0001.JPG', { type: 'image/jpeg' });
    const dimensions = async (file: File) => { const image = await createImageBitmap(file); return [image.width, image.height]; };
    const portrait = await lightenPortrait(photo);
    const paper = await lightenDocument(photo);
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' });
    const broken = new File(['x'], 'abimee.jpg', { type: 'image/jpeg' });
    return {
      source: photo.size,
      portrait: { name: portrait.name, type: portrait.type, size: portrait.size, dimensions: await dimensions(portrait) },
      paper: { dimensions: await dimensions(paper), size: paper.size },
      untouched: [(await lightenPortrait(svg)) === svg, (await lightenPortrait(broken)) === broken, (await lightenDocument(null)) === null],
    };
  });
  expect(sizes.portrait).toMatchObject({ name: 'IMG_0001.jpg', type: 'image/jpeg', dimensions: [512, 341] });
  expect(sizes.paper.dimensions).toEqual([1600, 1067]); // mode Prod du serveur de test
  expect(sizes.portrait.size).toBeLessThan(sizes.source / 10);
  expect(sizes.paper.size).toBeLessThan(sizes.source / 2);
  expect(sizes.untouched).toEqual([true, true, true]);
});

test.describe('Notifications push', () => {
  test('appareil partagé : l’abonnement suit la personne connectée', async ({ page }) => {
    // Push configuré et appareil déjà abonné (le serveur de test n'a ni clé ni service worker).
    await page.route(/\/src\/lib\/pushNotifications\.js/, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('import.meta.env.VITE_VAPID_PUBLIC_KEY', "'simulation'") });
    });
    await page.addInitScript(() => {
      const subscription = { endpoint: 'https://push.test/appareil', toJSON: () => ({ endpoint: 'https://push.test/appareil', keys: { p256dh: 'p', auth: 'a' } }) };
      Object.defineProperty(navigator.serviceWorker, 'getRegistration', { value: async () => ({ pushManager: { getSubscription: async () => subscription } }) });
    });
    const backend = await simulateBackend(page, { accounts: [account('guichetiere'), account('autre')], tables: base });
    const owners = () => backend.allWrites.filter(write => write.table === 'push_subscriptions').map(write => write.body.user_id);
    const signIn = async (id: string) => {
      await page.goto('/espace-guichetiere');
      await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(`${id}@exemple.test`);
      await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
      await page.locator('form button[type="submit"]').first().click();
      await expect(menuOf(page)).toBeVisible();
      await backend.settle();
    };
    await signIn('guichetiere');
    await expect.poll(() => owners().at(-1)).toBe('guichetiere-1');
    // Même personne : rien n'est réécrit.
    const written = owners().length;
    await page.reload();
    await expect(menuOf(page)).toBeVisible();
    await backend.settle();
    expect(owners()).toHaveLength(written);

    await page.getByRole('button', { name: 'Déconnexion' }).first().click();
    await expect(menuOf(page)).toHaveCount(0);
    await signIn('autre');
    await expect.poll(() => owners().at(-1)).toBe('autre-1');
  });

  test('message de l’exploitation : la fonction reçoit son identifiant, jamais une cible élargie', async ({ page }) => {
    const pushes: any[] = [];
    const backend = await open(page, 'exploitation', 'demo', { path: '/espace-exploitation/notifications-exploitation' });
    await page.route(/\/functions\/v1\/send-push/, route => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      pushes.push({ body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
      return route.fulfill({ json: { sent: 1 } });
    });
    await page.getByRole('button', { name: 'Nouveau message' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Sélection individuelle').click();
    await dialog.getByText('Traoré', { exact: false }).first().click();
    await dialog.getByPlaceholder(/^Ex : Mise à jour/).fill('Réservé');
    await dialog.getByPlaceholder('Rédigez votre message ici…').fill('Texte confidentiel');
    await dialog.getByRole('button', { name: /Envoyer/ }).click();
    await expect.poll(() => pushes.length).toBe(1);
    await page.waitForTimeout(300);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].body).toEqual({ message_id: 1, roles: ['guichetiere'] });
    // Session de l'utilisateur, pas la clé publique.
    expect(pushes[0].authorization).not.toBe('Bearer simulation');
    expect(backend.writes().find(write => write.table === 'messages_exploitation')!.body).toMatchObject({ guichetiere_matricules: ['M-autre'] });
  });
});
