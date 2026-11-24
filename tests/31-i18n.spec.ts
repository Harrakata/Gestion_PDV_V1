import { test, expect, type Page } from '@playwright/test';

// Application en anglais. Base simulée : rien n'est lu ni écrit.
type Options = { user?: 'fr' | 'en'; client?: 'fr' | 'en'; rows?: Record<string, any[]> };

const agences = [{ id: 'a1', nom: 'Gombe', region: 'Nord', secteur: 'S1', codePDV: '001', nbreTerminaux: 2, is_current: true, statut: 'Actif', adresse: 'Av. 1' }];

/** Base simulée ; renvoie les écritures et les fichiers demandés. */
const prepare = async (page: Page, { user, client, rows = {} }: Options = {}) => {
  const settings: { language?: string } = { language: client };
  const writes: { method: string; body: any }[] = [];
  const files: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => files.push(request.url()));
  if (user) await page.addInitScript(value => { if (!sessionStorage.getItem('prepared')) { localStorage.setItem('app_language_user', value); sessionStorage.setItem('prepared', '1'); } }, user);
  await page.routeWebSocket(/supabase/, ws => { ws.close(); });
  await page.route(/supabase\.(co|in)|\/rest\/v1\/|\/auth\/v1\/|\/functions\/v1\//, route => {
    const request = route.request();
    const url = decodeURIComponent(request.url());
    const single = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (url.includes('/app_settings') && request.method() !== 'GET') {
      const body = request.postDataJSON();
      writes.push({ method: request.method(), body });
      if (body?.value?.language) settings.language = body.value.language;
      return route.fulfill({ status: 201, json: [] });
    }
    let result: any[] = [];
    if (url.includes('key=eq.app_language') && settings.language) result = [{ id: 1, value: { language: settings.language } }];
    else if (url.includes('/agences?')) result = agences;
    const table = Object.keys(rows).find(name => url.includes(`/${name}?`));
    if (table) result = rows[table];
    return single && !result.length ? route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'aucune ligne' } }) : route.fulfill({ json: single ? result[0] : result });
  });
  return { settings, writes, files, errors };
};
const fixture = (screen: string) => `/tests/fixtures/big-screens.html?screen=${screen}`;
const lang = (page: Page) => page.evaluate(() => document.documentElement.lang);

test.describe('Choix de la langue', () => {
  test('français par défaut, sans télécharger le dictionnaire anglais', async ({ page }) => {
    const { files } = await prepare(page);
    await page.goto('/');
    await expect(page.getByText('Gestion de Planning & Pointage')).toBeVisible();
    expect(await lang(page)).toBe('fr');
    expect(files.some(url => url.includes('locales/en.json'))).toBe(false);
  });

  test('langue du client appliquée au démarrage, sans action de l’utilisateur', async ({ page }) => {
    const { errors } = await prepare(page, { client: 'en' });
    await page.goto('/');
    await expect(page.getByText('Schedule & attendance management')).toBeVisible();
    expect(await lang(page)).toBe('en');
    expect(errors).toEqual([]);
  });

  test('Paramètres → Langue enregistre pour tous et recharge en anglais', async ({ page }) => {
    const { writes } = await prepare(page);
    await page.goto(fixture('parametres'));
    await page.getByRole('button', { name: /^Langue/ }).click();
    const group = page.getByRole('radiogroup', { name: "Langue de l'application" });
    await expect(group.getByRole('radio', { name: 'Français' })).toHaveAttribute('aria-checked', 'true');
    const save = page.getByRole('button', { name: 'Enregistrer la langue' });
    await expect(save).toBeDisabled();
    await group.getByRole('radio', { name: 'English' }).click();
    await save.click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(await lang(page)).toBe('en');
    expect(writes.map(write => write.body.value)).toEqual([{ language: 'en' }]);

    // Retour au français depuis l'écran anglais.
    await page.getByRole('button', { name: /^Language/ }).click();
    await page.getByRole('radiogroup', { name: 'Application language' }).getByRole('radio', { name: 'Français' }).click();
    await page.getByRole('button', { name: 'Save language' }).click();
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
    expect(await lang(page)).toBe('fr');
  });

  test('échec d’enregistrement : message, langue inchangée', async ({ page }) => {
    await prepare(page);
    await page.route(/app_settings/, route => (route.request().method() === 'GET' ? route.fallback() : route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })));
    await page.goto(fixture('parametres'));
    await page.getByRole('button', { name: /^Langue/ }).click();
    await page.getByRole('radio', { name: 'English' }).first().click();
    await page.getByRole('button', { name: 'Enregistrer la langue' }).click();
    await expect(page.getByText('Enregistrement impossible').first()).toBeVisible();
    expect(await lang(page)).toBe('fr');
  });

  test('choix personnel prioritaire sur la langue du client', async ({ page }) => {
    await prepare(page, { user: 'fr', client: 'en' });
    await page.goto(fixture('parametres'));
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
    await page.getByRole('button', { name: /^Langue/ }).click();
    await page.getByRole('radiogroup', { name: 'Langue sur cet appareil' }).getByRole('radio', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('app_language_user'))).toBe('en');
    await page.getByRole('button', { name: /^Language/ }).click();
    await page.getByRole('radiogroup', { name: 'Language on this device' }).getByRole('radio', { name: 'Application language' }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('app_language_user'))).toBe(null);
  });
});

test.describe('Écrans en anglais', () => {
  const SCREENS = ['salaire', 'tableau', 'centre', 'mobi', 'parametres', 'formule', 'reparation', 'pieces', 'planning', 'technicien', 'guichetiere', 'general',
    'ccope', 'ccopeglob', 'performance', 'regional', 'planification', 'maintenance', 'rapports', 'enjeux', 'ticket', 'traitement', 'technicienTickets', 'faire', 'chronologie', 'signature'];
  // Mots français sans équivalent anglais de même forme.
  const FRENCH = /[àâçèéêëîïôûùœ]|\b(le|la|les|des|du|une|un|aucun|aucune|pour|avec|sans|dans|votre|vos|mois|semaine|chargement|rechercher|toutes?|tous|choisir|ajouter|supprimer|modifier|enregistrer|annuler|fermer|valider|agences?|guichetières?|demandes?|terminaux|secteurs?|montants?)\b/i;
  const ALLOWED = /Français|Traoré|Agence test/;

  for (const screen of SCREENS) {
    test(`${screen} : aucun texte resté en français`, async ({ page }) => {
      const { errors } = await prepare(page, { user: 'en' });
      await page.goto(fixture(screen));
      await expect(page.locator('#main-content')).toContainText(/\S/);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      const texts = await page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.querySelector('#main-content')!, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) if (!walker.currentNode.parentElement!.closest('style, script')) out.push(walker.currentNode.textContent!.trim());
        document.querySelectorAll('#main-content :is([placeholder], [title], [aria-label])').forEach(el => ['placeholder', 'title', 'aria-label'].forEach(name => out.push(el.getAttribute(name) || '')));
        return out.filter(Boolean);
      });
      expect(texts.length).toBeGreaterThan(2);
      expect([...new Set(texts)].filter(value => FRENCH.test(value) && !ALLOWED.test(value))).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test('fenêtre : un seul bouton de fermeture', async ({ page }) => {
    await prepare(page, { user: 'en' });
    await page.goto(fixture('ticket'));
    await page.getByRole('button', { name: /report/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Report an incident')).toBeVisible();
    // Le bouton « Cancel » suffit : pas de croix en double.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /close/i })).toHaveCount(0);
  });

  test('listes : recherche par le libellé anglais ou français', async ({ page }) => {
    await prepare(page, { user: 'en' });
    await page.goto(fixture('pieces'));
    await page.getByRole('combobox', { name: /sub-assembl/i }).first().click();
    const search = page.locator('[cmdk-input]');
    for (const word of ['printer', 'imprimante']) {
      await search.fill(word);
      await expect(page.getByRole('option', { name: /printer/i }).first()).toBeVisible();
    }
    await search.fill('zzz');
    await expect(page.getByRole('option')).toHaveCount(0);
  });

  test('badge de statut : même couleur dans les deux langues', async ({ page, context }) => {
    const classes = async (target: Page, language: 'fr' | 'en') => {
      await prepare(target, { user: language, rows: { tickets_incidents: [{ id: 1, code: 'INC-1', titre: 'Panne', categorie: 'terminal', priorite: 'haute', statut: 'ouvert', created_at: new Date().toISOString() }] } });
      await target.goto(fixture('traitement'));
      const badge = target.getByText(language === 'fr' ? 'Haute' : 'High', { exact: true }).first();
      await expect(badge).toBeVisible();
      return badge.evaluate(el => (el.closest('[class*="rounded-pill"], [class*="inline-flex"]') || el).className);
    };
    expect(await classes(page, 'en')).toBe(await classes(await context.newPage(), 'fr'));
  });

  test('dates et nombres au format anglais', async ({ page }) => {
    await prepare(page, { user: 'en' });
    await page.goto(fixture('tableau'));
    const expected = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    await expect(page.getByText(expected)).toBeVisible();
  });

  test('graphiques : axes et légendes traduits', async ({ page }) => {
    await prepare(page, { user: 'en' });
    await page.goto(fixture('tableau'));
    await expect(page.locator('.recharts-wrapper').getByText('GPS compliance')).toBeVisible();
    await expect(page.locator('.recharts-wrapper').getByText('Conformité GPS')).toHaveCount(0);
  });
});

test.describe('Moteur de traduction', () => {
  test('suffixes, motifs, textes joints ; données des utilisateurs inchangées', async ({ page }) => {
    await prepare(page, { user: 'en' });
    await page.goto(fixture('signature'));
    const result = await page.evaluate(async () => {
      const engine = await import(/* @vite-ignore */ '/src/i18n/translate.js');
      engine.buildDictionary(await (await fetch('/src/i18n/locales/en.json')).json());
      const samples = ['Enregistrer', 'Rechercher…', 'Nom *', 'Agence :', '3 jours', '12 mois', '2 agences', 'Semaine du 5 May', 'Actif · Aujourd’hui', 'directeur régional',
        'Supprimer TERM01 ?', 'Rose', 'Sam', 'Rose Diallo', 'Agence du Marché', 'Gombe', 'Café au lait'];
      return Object.fromEntries(samples.map(value => [value, engine.t(value)]));
    });
    expect(result).toEqual({
      Enregistrer: 'Save', 'Rechercher…': 'Search…', 'Nom *': 'Last name *', 'Agence :': 'Branch:', '3 jours': '3 days', '12 mois': '12 months', '2 agences': '2 branches',
      'Semaine du 5 May': 'Week of 5 May', 'Actif · Aujourd’hui': 'Active · Today', 'directeur régional': 'regional director', 'Supprimer TERM01 ?': 'Delete TERM01?',
      Rose: 'Rose', Sam: 'Sam', 'Rose Diallo': 'Rose Diallo', 'Agence du Marché': 'Agence du Marché', Gombe: 'Gombe', 'Café au lait': 'Café au lait',
    });
  });

  test('toutes les traductions sont stables (une phrase traduite ne change plus)', async ({ page }) => {
    await prepare(page, { user: 'en' });
    await page.goto(fixture('signature'));
    const unstable = await page.evaluate(async () => {
      const engine = await import(/* @vite-ignore */ '/src/i18n/translate.js');
      const dictionary = await (await fetch('/src/i18n/locales/en.json')).json();
      engine.buildDictionary(dictionary);
      const out: string[] = [];
      Object.keys(dictionary.text).forEach(key => { const once = engine.t(key); if (engine.t(once) !== once) out.push(`${key} → ${once} → ${engine.t(once)}`); });
      Object.entries(dictionary.patterns as Record<string, string>).forEach(([key]) => {
        const source = key.split('{}').reduce((text, piece, index, all) => text + piece + (index === all.length - 1 ? '' : /[A-Za-zÀ-ÿ]$/.test(piece) ? 's' : `X${index}z`), '');
        const once = engine.t(source);
        if (engine.t(once) !== once) out.push(`${source} → ${once} → ${engine.t(once)}`);
      });
      return out;
    });
    expect(unstable).toEqual([]);
  });
});

test('assistant : fiche trouvée avec une question en anglais, réponse demandée en anglais', async ({ page }) => {
  await prepare(page, { user: 'en' });
  await page.goto('/tests/fixtures/operational-assistant.html?error=1');
  await page.getByRole('button', { name: 'Open the assistant' }).click();
  await page.getByRole('textbox').fill('how do I assign an assembled terminal');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Choose Assign an assembled terminal, then select a reference marked Available.')).toBeVisible();
});
