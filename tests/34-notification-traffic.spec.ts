import { test, expect, type Page } from '@playwright/test';
import { EXPLOITATION_ACCESS_LEVELS, EXPLOITATION_MENU_PERMISSIONS } from '../src/lib/exploitationProfiles.js';
import { simulateBackend, type Account, type Row } from './helpers/simulatedBackend';

// Volume des lectures automatiques (cloche de notifications, écrans de paiement) et réactivité,
// dans l'application complète, sur une base simulée et une horloge accélérée.
const account = (id: string): Account => ({ id: `auth-${id}`, email: `${id}@exemple.test`, password: 'motdepasse-test' });
const permissions = Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path }: any) => [path, EXPLOITATION_ACCESS_LEVELS.WRITE]));
const base: Record<string, Row[]> = {
  agences: [{ id: 'a1', nom: 'Gombe', region: 'Nord', secteur: 'Secteur 1', codePDV: '001', is_current: true, statut: 'Actif' }],
  regions: [{ id: 'r1', nom: 'Nord' }],
  secteurs: [{ id: 's1', nom: 'Secteur 1', region: 'Nord', code: 'S1' }],
};
const person = (id: string, extra: Row = {}): Row => ({ id: `${id}-1`, nom: 'Diallo', prenom: 'Awa', email: `${id}@exemple.test`, matricule: `M-${id}`, auth_user_id: `auth-${id}`, is_current: true, statut: 'Actif', ...extra });
// Plafonds : lectures automatiques en 10 minutes, sans temps réel (une par minute et par source)
// puis avec (lecture de sécurité). Avant optimisation : 280, 200, 120, 200 et 160.
type Space = { id: string; path: string; tables: Record<string, Row[]>; twoSteps?: boolean; fallback: number; live: number };
const SPACES: Record<string, Space> = {
  exploitation: { id: 'exploitation', path: '/espace-exploitation', tables: { profils_exploitation: [person('exploitation', { permissions })] }, fallback: 50, live: 15 },
  chef: { id: 'chef', path: '/espace-chef-agence', twoSteps: true, tables: { chefs_agence: [person('chef', { id: 12, agenceEnCharge: 'Gombe', codePDV: '001' })] }, fallback: 50, live: 15 },
  guichetiere: { id: 'guichetiere', path: '/espace-guichetiere', tables: { guichetieres: [person('guichetiere', { agenceAssigne: 'Gombe', codePrepose: 'P1' })] }, fallback: 30, live: 9 },
  technicien: { id: 'technicien', path: '/espace-technicien', tables: { techniciens: [person('technicien', { id: 7 })] }, fallback: 40, live: 12 },
  regional: { id: 'regional', path: '/espace-validation-paiement-gain', tables: { validateurs_paiement_gain: [person('regional', { id: 3, fonction: 'Directeur régional', regionAssignee: 'Nord' })] }, fallback: 40, live: 12 },
};

const menuOf = (page: Page) => page.getByRole('navigation', { name: /^Menu · / });
const submit = (page: Page) => page.locator('main form button[type="submit"], form button[type="submit"]').first();
const bell = (page: Page) => page.getByRole('button', { name: /notification/i }).first();

/** Connecté, notifications de l'appareil activées, horloge simulée. */
const open = async (page: Page, space: Space, { realtime = false, tables = {} as Record<string, Row[]>, path = '' } = {}) => {
  await page.addInitScript(() => {
    localStorage.setItem('local_notif_enabled', '1');
    (window as any).shown = [];
    class FakeNotification {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title: string) { (window as any).shown.push(title); }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
    // Pas de service worker sur le serveur de test : appareil sans abonnement push.
    Object.defineProperty(navigator.serviceWorker, 'ready', { value: Promise.resolve({ pushManager: { getSubscription: async () => null } }) });
  });
  const data = { ...base, ...space.tables, ...tables };
  const backend = await simulateBackend(page, { accounts: [account(space.id)], tables: data, realtime });
  await page.clock.install();
  await page.goto(path || space.path);
  await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(`${space.id}@exemple.test`);
  if (space.twoSteps) await submit(page).click();
  await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
  await submit(page).click();
  await expect(menuOf(page)).toBeVisible();
  await backend.settle();
  return { ...backend, data };
};
const advance = async (page: Page, minutes: number) => {
  for (let done = 0; done < minutes; done += 1) {
    for (let i = 0; i < 6; i += 1) { await page.clock.runFor(10_000); await page.waitForTimeout(30); }
  }
  await page.waitForTimeout(150);
};
const since = (reads: string[], start: number) => reads.slice(start);
const setHidden = (page: Page, hidden: boolean) => page.evaluate(value => {
  Object.defineProperty(document, 'visibilityState', { get: () => (value ? 'hidden' : 'visible'), configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event(value ? 'blur' : 'focus'));
}, hidden);

test.describe('Volume des lectures automatiques', () => {
  test.setTimeout(120_000);

  for (const space of Object.values(SPACES)) {
    test(`${space.id} : sans temps réel`, async ({ page }) => {
      const backend = await open(page, space);
      const start = backend.reads.length;
      const beats = () => backend.allWrites.filter(write => write.table === 'activites_sessions').length;
      const beatsBefore = beats();
      await advance(page, 10);
      // Présence : un signal toutes les 2 minutes.
      expect(beats() - beatsBefore).toBeGreaterThanOrEqual(4);
      expect(beats() - beatsBefore).toBeLessThanOrEqual(5);
      const seen = since(backend.reads, start);
      expect(seen.length, seen.join()).toBeGreaterThan(0);
      expect(seen.length, seen.join()).toBeLessThanOrEqual(space.fallback);
      expect(backend.errors).toEqual([]);
    });

    test(`${space.id} : temps réel actif`, async ({ page }) => {
      const backend = await open(page, space, { realtime: true });
      // La télémétrie des autres appareils n'est pas écoutée et ne déclenche plus rien
      // (vérifié juste après le chargement, loin de toute lecture de sécurité).
      expect(backend.listened().length).toBeGreaterThan(0);
      expect(backend.listened()).not.toContain('sync_health');
      const before = backend.reads.length;
      backend.emit('sync_health', { id: 1 });
      await page.waitForTimeout(100);
      await page.clock.runFor(3000);
      await page.waitForTimeout(200);
      expect(since(backend.reads, before)).toEqual([]);

      const start = backend.reads.length;
      await advance(page, 10);
      const seen = since(backend.reads, start);
      expect(seen.length, seen.join()).toBeLessThanOrEqual(space.live);
      expect(backend.errors).toEqual([]);
    });
  }

  test('au chargement, la cloche et la surveillance globale ne lisent qu’une fois', async ({ page }) => {
    const backend = await open(page, SPACES.guichetiere);
    const start = backend.reads.length;
    await page.reload();
    await expect(menuOf(page)).toBeVisible();
    await page.clock.runFor(5000);
    await backend.settle();
    const seen = since(backend.reads, start);
    expect(seen.filter(table => table === 'messages_exploitation')).toHaveLength(1);
    expect(seen.filter(table => table === 'points_vente_mobi_change_requests')).toHaveLength(1);
  });

  test('onglet masqué : lectures espacées ; retour à l’écran : une relecture, pas quatre', async ({ page }) => {
    const backend = await open(page, SPACES.guichetiere);
    await setHidden(page, true);
    const start = backend.reads.length;
    await advance(page, 4);
    expect(since(backend.reads, start)).toEqual([]);
    await setHidden(page, false);
    await backend.settle();
    expect(since(backend.reads, start).filter(table => table === 'messages_exploitation')).toHaveLength(1);
    // Allers-retours rapprochés.
    const after = backend.reads.length;
    for (let i = 0; i < 5; i += 1) { await setHidden(page, true); await setHidden(page, false); await page.clock.runFor(2000); }
    await page.waitForTimeout(200);
    expect(since(backend.reads, after)).toEqual([]);
  });

  test('après la déconnexion, plus aucune lecture', async ({ page }) => {
    const backend = await open(page, SPACES.exploitation, { realtime: true });
    await page.getByRole('button', { name: 'Déconnexion' }).first().click();
    await expect(menuOf(page)).toHaveCount(0);
    await page.clock.runFor(5000);
    await backend.settle();
    const start = backend.reads.length;
    await advance(page, 10);
    expect(since(backend.reads, start)).toEqual([]);
  });
});

test.describe('Réactivité de la cloche', () => {
  const message = (id: number, extra: Row = {}): Row => ({ id, titre: `Consigne ${id}`, corps: 'Texte', categorie: 'info', destinataires: 'guichetiere', actif: true, created_at: '2026-11-24T09:00:00Z', ...extra });

  test('un message arrive aussitôt, par une seule lecture', async ({ page }) => {
    const messages: Row[] = [];
    const backend = await open(page, SPACES.guichetiere, { realtime: true, tables: { messages_exploitation: messages } });
    const start = backend.reads.length;
    messages.push(message(1));
    backend.emit('messages_exploitation', messages[0], 'INSERT');
    await page.waitForTimeout(100);
    await page.clock.runFor(1000);
    await expect(bell(page)).toContainText('1');
    expect(since(backend.reads, start)).toEqual(['messages_exploitation']);
    await expect.poll(() => page.evaluate(() => (window as any).shown)).toEqual(["Message(s) de l'exploitation"]);
  });

  test('un changement destiné à d’autres ne provoque aucune lecture', async ({ page }) => {
    const backend = await open(page, SPACES.guichetiere, { realtime: true });
    const start = backend.reads.length;
    backend.emit('messages_exploitation', message(2, { destinataires: 'exploitation' }), 'INSERT');
    backend.emit('points_vente_mobi_change_requests', { id: 5, guichetiere_matricule: 'M-autre' });
    await page.waitForTimeout(100);
    await page.clock.runFor(3000);
    await page.waitForTimeout(200);
    expect(since(backend.reads, start)).toEqual([]);
    backend.emit('points_vente_mobi_change_requests', { id: 6, guichetiere_matricule: 'M-guichetiere' });
    await page.waitForTimeout(100);
    await page.clock.runFor(3000);
    await expect.poll(() => since(backend.reads, start)).toEqual(['points_vente_mobi_change_requests']);
  });

  test('chef d’agence : messages par agence, par secteur et par région', async ({ page }) => {
    const toChef = (id: number, extra: Row) => message(id, { destinataires: 'chef_agence', ...extra });
    const backend = await open(page, SPACES.chef, {
      tables: {
        messages_exploitation: [
          toChef(1, { region_nom: 'Nord' }), toChef(2, { secteur_nom: 'Secteur 1' }), toChef(3, { agence_nom: 'Gombe' }), toChef(4, {}),
          toChef(5, { region_nom: 'Sud' }), toChef(6, { secteur_nom: 'Secteur 9' }), toChef(7, { agence_nom: 'Autre' }),
        ],
      },
    });
    await expect(bell(page)).toContainText('4');
    await bell(page).click();
    await page.getByText("Message(s) de l'exploitation").first().click();
    for (const id of [1, 2, 3, 4]) await expect(page.getByText(`Consigne ${id}`).first()).toBeVisible();
    for (const id of [5, 6, 7]) await expect(page.getByText(`Consigne ${id}`)).toHaveCount(0);
    // La région et le secteur de l'agence ne sont lus qu'une fois.
    const start = backend.reads.length;
    await advance(page, 2);
    expect(since(backend.reads, start)).not.toContain('agences');
  });

  test('sans temps réel, le message arrive dans la minute', async ({ page }) => {
    const messages: Row[] = [];
    await open(page, SPACES.guichetiere, { tables: { messages_exploitation: messages } });
    messages.push(message(1));
    await advance(page, 1);
    await page.clock.runFor(5000);
    await expect(bell(page)).toContainText('1');
  });

  test('tickets : ouverts et en retard comptés en une lecture', async ({ page }) => {
    const ticket = (id: number, statut: string, created_at: string): Row => ({ id, statut, priorite: 'haute', created_at });
    const recent = new Date().toISOString();
    const backend = await open(page, SPACES.exploitation, { tables: { tickets_incidents: [ticket(1, 'ouvert', recent), ticket(2, 'ouvert', '2020-01-01T00:00:00Z'), ticket(3, 'en_cours', '2020-01-01T00:00:00Z'), ticket(4, 'resolu', '2020-01-01T00:00:00Z')] } });
    await bell(page).click();
    await expect(page.getByText('Tickets à traiter').first()).toBeVisible();
    await expect(page.getByText('Tickets en retard (SLA)').first()).toBeVisible();
    await expect(bell(page)).toContainText('4'); // 2 ouverts + 2 en retard
    const start = backend.reads.length;
    await advance(page, 1);
    expect(since(backend.reads, start).filter(table => table === 'tickets_incidents')).toHaveLength(1);
  });

  test('une panne passagère n’efface pas la cloche et ne relance pas l’alerte', async ({ page }) => {
    const backend = await open(page, SPACES.guichetiere, { tables: { messages_exploitation: [message(1)] } });
    await expect(bell(page)).toContainText('1');
    backend.failing.add('messages_exploitation');
    await advance(page, 3);
    await expect(bell(page)).toContainText('1');
    backend.failing.clear();
    await advance(page, 2);
    await expect(bell(page)).toContainText('1');
    expect(await page.evaluate(() => (window as any).shown)).toEqual([]);
  });

  test('sur l’accueil, l’espace reste suivi avec sa propre session', async ({ page }) => {
    const messages: Row[] = [];
    const backend = await open(page, SPACES.guichetiere, { realtime: true, tables: { messages_exploitation: messages } });
    const bearers: string[] = [];
    page.on('request', request => { if (request.url().includes('/rest/v1/messages_exploitation')) bearers.push(request.headers().authorization || ''); });
    await page.evaluate(() => { window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(menuOf(page)).toHaveCount(0);
    await page.clock.runFor(3000);
    await backend.settle();
    const start = backend.reads.length;
    messages.push(message(7));
    backend.emit('messages_exploitation', messages[0], 'INSERT');
    await page.waitForTimeout(100);
    await page.clock.runFor(1000);
    await expect.poll(() => since(backend.reads, start)).toEqual(['messages_exploitation']);
    await expect.poll(() => page.evaluate(() => (window as any).shown)).toEqual(["Message(s) de l'exploitation"]);
    // Jeton de la guichetière, et non la clé publique de l'application.
    expect(bearers).toHaveLength(1);
    expect(bearers[0]).not.toBe('Bearer simulation');
  });
});

test.describe('Écrans de paiement', () => {
  const demande = (extra: Row = {}): Row => ({ id: 1, codeDemande: 'PG-0001', montantGain: 500000, statutGlobal: 'En attente directeur régional', niveauValidationCourant: 'directeur_regional', directeurRegionalId: 3, chefAgenceId: 12, agenceOrigineNom: 'Gombe', created_at: '2026-11-24T08:00:00Z', updated_at: '2026-11-24T08:00:00Z', ...extra });

  test('directeur régional : une nouvelle demande s’affiche sans recharger', async ({ page }) => {
    const demandes: Row[] = [];
    const backend = await open(page, SPACES.regional, { realtime: true, tables: { demandes_paiement_gain: demandes } });
    const start = backend.reads.length;
    demandes.push(demande());
    backend.emit('demandes_paiement_gain', demandes[0], 'INSERT');
    await page.waitForTimeout(100);
    await page.clock.runFor(4000);
    await expect(page.getByText('PG-0001').first()).toBeVisible();
    // Cloche : 1 lecture ; écran : demandes et historique.
    expect(since(backend.reads, start).sort()).toEqual(['demandes_paiement_gain', 'demandes_paiement_gain', 'paiement_gain_workflow_events']);
  });

  for (const [name, space, path, referentiels] of [
    ['chef d’agence', SPACES.chef, '/espace-chef-agence/paiement-gros-gain', ['agences', 'validateurs_paiement_gain']],
    ['Exploitation', SPACES.exploitation, '/espace-exploitation/autorisation-paiement-gain', ['agences', 'paiement_gain_sms_notifications']],
  ] as const) {
    test(`${name} : l’écran suit les demandes sans tout relire`, async ({ page }) => {
      const demandes: Row[] = [];
      const backend = await open(page, space, { realtime: true, tables: { demandes_paiement_gain: demandes }, path });
      await page.goto(path);
      await expect(menuOf(page)).toBeVisible();
      await backend.settle();
      for (const table of referentiels) expect(backend.reads).toContain(table);
      const start = backend.reads.length;
      demandes.push(demande({ statutGlobal: 'En attente exploitation', niveauValidationCourant: 'exploitation' }));
      backend.emit('demandes_paiement_gain', demandes[0], 'INSERT');
      await page.waitForTimeout(100);
      await page.clock.runFor(4000);
      await expect.poll(() => since(backend.reads, start)).toContain('paiement_gain_workflow_events');
      await backend.settle();
      expect(since(backend.reads, start)).not.toContain('agences');
      const idle = backend.reads.length;
      await advance(page, 10);
      // Avant : 40 relectures complètes (6 requêtes) en 10 minutes.
      expect(since(backend.reads, idle).filter(table => table === 'paiement_gain_workflow_events').length).toBeLessThanOrEqual(3);
      expect(backend.errors).toEqual([]);
    });
  }
});
