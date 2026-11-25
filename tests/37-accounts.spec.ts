import { test, expect, type Page } from '@playwright/test';
import { EXPLOITATION_ACCESS_LEVELS, EXPLOITATION_MENU_PERMISSIONS } from '../src/lib/exploitationProfiles.js';
import { simulateBackend, type Row } from './helpers/simulatedBackend';

// Fiches et comptes d'accès : modifier une fiche garde son compte, un refus du serveur n'enregistre
// rien, et aucun mot de passe n'est lu ni enregistré avec les fiches.
const permissions = Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path }: any) => [path, EXPLOITATION_ACCESS_LEVELS.WRITE]));
const exploitation = { id: 'exploitation-1', nom: 'Diallo', prenom: 'Awa', email: 'exploitation@exemple.test', auth_user_id: 'auth-exploitation', statut: 'Actif', permissions };
const PASSWORD = 'MotDePasse!1';
// Les anciennes valeurs sont présentes en base : elles ne doivent jamais ressortir.
const tables: Record<string, Row[]> = {
  profils_exploitation: [exploitation],
  agences: [{ id: 'a1', nom: 'Gombe', codePDV: '001', region: 'Nord', is_current: true }, { id: 'a2', nom: 'Limete', codePDV: '002', region: 'Nord', is_current: true }],
  secteurs: [{ id: 's1', nom: 'Centre', codeSecteur: 'SC', region: 'Nord' }, { id: 's2', nom: 'Est', codeSecteur: 'SE', region: 'Nord' }],
  guichetieres: [{ id: 'g1', matricule: 'G1', codePrepose: 'P1', nom: 'Kouyaté', prenom: 'Fanta', email: 'fanta@exemple.test', telephone: '0101', mdpPrepose: 'ancien-secret', agenceAssigne: 'Gombe', disponibilite: 'Absent', dateDebutIndisponibilite: '2026-11-10', dateFinIndisponibilite: '2026-11-12', auth_user_id: 'auth-g1', is_current: true, valid_from: '2026-01-01' }],
  chefs_agence: [{ id: 12, matricule: 'C1', nom: 'Traoré', prenom: 'Issa', email: 'issa@exemple.test', telephone: '0202', mdp: 'ancien-secret', agenceEnCharge: 'Gombe', codePDV: '001', auth_user_id: 'auth-c1', is_current: true, valid_from: '2026-01-01' }],
  chefs_secteur: [{ id: 'cs1', matricule: 'S1', nom: 'Sow', prenom: 'Oumar', email: 'oumar@exemple.test', telephone: '0303', mdp: 'ancien-secret', secteurEnCharge: 'Centre', codeSecteur: 'SC', auth_user_id: 'auth-s1', is_current: true, valid_from: '2026-01-01' }],
  techniciens: [{ id: 41, matricule: 'T1', nom: 'Cissé', prenom: 'Moussa', email: 'moussa@exemple.test', telephone: '0404', motDePasse: 'ancien-secret', auth_user_id: 'auth-t1' }],
  regions: [{ id: 'r1', nom: 'Nord', codeRegion: 'R1' }],
  validateurs_paiement_gain: [
    { id: 31, fonction: 'Directeur régional', nom: 'Keita', prenom: 'Sira', email: 'sira@exemple.test', telephone: '0505', regionAssignee: 'Nord', statut: 'Actif', auth_user_id: 'auth-dr' },
    { id: 32, fonction: 'Directeur général', nom: 'Barry', prenom: 'Lamine', email: 'lamine@exemple.test', telephone: '0606', regionAssignee: null, statut: 'Actif', auth_user_id: 'auth-dg' },
  ],
};
type Answer = (body: any) => { status?: number; json: any };

const open = async (page: Page, screen: string, answer: Answer = () => ({ json: { ok: true } })) => {
  const backend = await simulateBackend(page, { accounts: [{ id: 'auth-exploitation', email: exploitation.email, password: 'motdepasse-test' }], tables });
  const calls: any[] = [];
  const selects: string[] = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.pathname.includes('/rest/v1/')) selects.push(decodeURIComponent(url.search)); });
  await page.route('**/functions/v1/admin-manage-user', route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ ...route.request().postDataJSON(), jwt: (route.request().headers().authorization || '').split('.').length === 3 });
    return route.fulfill({ status: 200, headers, ...answer(calls.at(-1)) });
  });
  await page.goto(`/espace-exploitation/${screen}`);
  await page.getByRole('textbox', { name: /^(Email|Identifiant)/ }).fill(exploitation.email);
  await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
  await page.locator('main form button[type="submit"], form button[type="submit"]').first().click();
  await expect(page.locator('.app-space-main').getByRole('button', { name: /^Ajouter un/ })).toBeVisible();
  await backend.settle();
  const writesTo = (table: string) => backend.writes().filter(write => write.table === table);
  return { backend, calls, selects, writesTo };
};
const dialog = (page: Page) => page.locator('[data-app-dialog]');
const edit = async (page: Page, name: string) => {
  await page.getByRole('button', { name: `Modifier ${name}`, exact: true }).first().click();
  await expect(dialog(page)).toBeVisible();
};
const PERSON = [
  { screen: 'guichetieres', table: 'guichetieres', name: 'Fanta Kouyaté', email: 'fanta@exemple.test', account: 'auth-g1', phone: '0101', add: 'Ajouter une Guichetière', key: 'mdpPrepose' },
  { screen: 'chefs-agence', table: 'chefs_agence', name: 'Issa Traoré', email: 'issa@exemple.test', account: 'auth-c1', phone: '0202', add: "Ajouter un Chef d'Agence", key: 'mdp' },
  { screen: 'chefs-secteur', table: 'chefs_secteur', name: 'Oumar Sow', email: 'oumar@exemple.test', account: 'auth-s1', phone: '0303', add: 'Ajouter un Chef de Secteur', key: 'mdp' },
  { screen: 'techniciens', table: 'techniciens', name: 'Moussa Cissé', email: 'moussa@exemple.test', account: 'auth-t1', phone: '0404', add: 'Ajouter un Technicien', key: 'motDePasse' },
];

for (const person of PERSON) {
  test.describe(person.screen, () => {
    test('modifier une fiche garde son compte, son e-mail et son téléphone', async ({ page }) => {
      const { calls, selects, writesTo, backend } = await open(page, person.screen);
      await edit(page, person.name);
      await expect(dialog(page).getByLabel(/^Email/)).toHaveValue(person.email);
      await dialog(page).getByLabel(/^Nom/).first().fill('Modifié');
      await dialog(page).getByRole('button', { name: /^(Sauvegarder|Enregistrer|Modifier)/ }).click();
      await expect.poll(() => writesTo(person.table).length).toBe(1);
      const [write] = writesTo(person.table);
      expect(write.method).toBe('PATCH');
      expect(write.body).toMatchObject({ nom: 'Modifié', email: person.email, auth_user_id: person.account, telephone: person.phone });
      if (person.table === 'guichetieres') expect(write.body).toMatchObject({ disponibilite: 'Absent', dateDebutIndisponibilite: '2026-11-10', dateFinIndisponibilite: '2026-11-12' });
      expect(calls).toEqual([]);
      expect(Object.keys(write.body)).not.toContain(person.key);
      expect(selects.filter(query => /select=[^&]*\b(mdp|mdpPrepose|motDePasse)\b/.test(query))).toEqual([]);
      expect(backend.errors).toEqual([]);
    });

    test('changer le mot de passe et l’e-mail agit sur le compte, sans rien écrire dans la fiche', async ({ page }) => {
      const { calls, writesTo } = await open(page, person.screen);
      await edit(page, person.name);
      await dialog(page).getByLabel(/^Email/).fill(' Nouveau@Exemple.test'.trim());
      await dialog(page).getByLabel(/mot de passe/i).first().fill(PASSWORD);
      await dialog(page).getByRole('button', { name: /^(Sauvegarder|Enregistrer|Modifier)/ }).click();
      await expect.poll(() => writesTo(person.table).length).toBe(1);
      expect(calls).toEqual([
        { action: 'updatePassword', userId: person.account, password: PASSWORD, table: person.table, jwt: true },
        { action: 'updateEmail', userId: person.account, email: 'nouveau@exemple.test', table: person.table, jwt: true },
      ]);
      expect(writesTo(person.table)[0].body).toMatchObject({ email: 'nouveau@exemple.test', auth_user_id: person.account });
      expect(JSON.stringify(writesTo(person.table))).not.toContain(PASSWORD);
    });

    test('refus du serveur : message affiché, rien n’est enregistré', async ({ page }) => {
      const { calls, writesTo } = await open(page, person.screen, () => ({ status: 403, json: { error: "Vous n'avez pas le droit de gérer ce compte." } }));
      await edit(page, person.name);
      await dialog(page).getByLabel(/mot de passe/i).first().fill(PASSWORD);
      await dialog(page).getByRole('button', { name: /^(Sauvegarder|Enregistrer|Modifier)/ }).click();
      await expect(page.getByText("Vous n'avez pas le droit de gérer ce compte.", { exact: true }).first()).toBeVisible();
      await expect(dialog(page)).toBeVisible();
      expect(calls).toHaveLength(1);
      expect(writesTo(person.table)).toEqual([]);
    });
  });
}

// La connexion d'un directeur exige ce lien : sans lui, plus d'accès.
for (const { screen, name, account } of [{ screen: 'validation-paiement-gain', name: 'Sira Keita', account: 'auth-dr' }, { screen: 'direction-generale', name: 'Lamine Barry', account: 'auth-dg' }]) {
  test(`${screen} : modifier un directeur garde son compte ; le supprimer aussi agit dessus`, async ({ page }) => {
    const { calls, writesTo } = await open(page, screen);
    await page.getByRole('button', { name: `Modifier le profil de ${name}` }).first().click();
    await dialog(page).getByRole('button', { name: 'Mettre à jour' }).click();
    await expect.poll(() => writesTo('validateurs_paiement_gain').length).toBe(1);
    expect(writesTo('validateurs_paiement_gain')[0].body).toMatchObject({ auth_user_id: account });
    expect(calls).toEqual([]);

    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: new RegExp(`Supprimer .*${name}`) }).first().click();
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect.poll(() => writesTo('validateurs_paiement_gain').map(({ method }) => method)).toEqual(['PATCH', 'DELETE']);
    expect(calls).toEqual([{ action: 'delete', userId: account, table: 'validateurs_paiement_gain', jwt: true }]);
  });
}

// Changer d'affectation : la fiche garde son identifiant, donc son compte, ses droits et ses demandes.
for (const { screen, table, field, code, value, newCode, oldValue } of [
  { screen: 'chefs-agence', table: 'chefs_agence', field: 'agenceEnCharge', code: 'codePDV', value: 'Limete', newCode: '002', oldValue: 'Gombe' },
  { screen: 'chefs-secteur', table: 'chefs_secteur', field: 'secteurEnCharge', code: 'codeSecteur', value: 'Est', newCode: 'SE', oldValue: 'Centre' },
]) {
  test(`${screen} : réaffectation sans perte, ancienne affectation archivée`, async ({ page }) => {
    const { writesTo, calls, backend } = await open(page, screen);
    const person = PERSON.find(item => item.table === table)!;
    const id = tables[table][0].id;
    await page.getByRole('row').filter({ hasText: person.name.split(' ')[1] }).getByTitle('Historique SCD2').click();
    await dialog(page).getByRole('combobox').selectOption(value);
    await dialog(page).getByRole('button', { name: 'Valider le changement' }).click();
    await expect.poll(() => writesTo(table).length).toBe(2);
    const [archive, update] = writesTo(table);
    expect(archive.method).toBe('POST');
    expect(archive.body).toMatchObject({ [field]: oldValue, is_current: false, auth_user_id: null, email: person.email });
    expect(update.method).toBe('PATCH');
    expect(update.query).toContain(`id=eq.${id}`);
    expect(Object.keys(update.body).sort()).toEqual([field, code, 'valid_from'].sort());
    expect(update.body).toMatchObject({ [field]: value, [code]: newCode });
    expect(calls).toEqual([]);
    await expect(page.getByText('Affectation modifiée', { exact: true }).first()).toBeVisible();
    expect(backend.errors).toEqual([]);
  });
}

test('chef de secteur déjà réaffecté : connexion possible, avec sa fiche en cours', async ({ page }) => {
  const archived = { ...tables.chefs_secteur[0], id: 'cs0', secteurEnCharge: 'Ancien secteur', is_current: false };
  for (const identifier of ['S1', 'oumar@exemple.test']) {
    const backend = await simulateBackend(page, { accounts: [{ id: 'auth-s1', email: 'oumar@exemple.test', password: 'motdepasse-test' }], tables: { ...tables, chefs_secteur: [archived, tables.chefs_secteur[0]] } });
    await page.goto('/espace-chef-secteur');
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.getByRole('textbox', { name: /^(Email|Identifiant|Matricule)/ }).first().fill(identifier);
    await page.getByLabel(/^Mot de passe/).first().fill('motdepasse-test');
    await page.locator('main form button[type="submit"], form button[type="submit"]').first().click();
    await backend.settle();
    const stored = await page.evaluate(() => Object.values(localStorage).find(item => String(item).includes('"chef":')) || '');
    expect(JSON.parse(stored).chef).toMatchObject({ id: 'cs1', secteurEnCharge: 'Centre' });
    expect(backend.writes()).toEqual([]);
  }
});

const create = async (page: Page) => {
  await page.getByRole('button', { name: 'Ajouter un Technicien' }).click();
  for (const [id, value] of [['matricule', 'T9'], ['nom', 'Ba'], ['prenom', 'Ali'], ['email', 'ali@exemple.test'], ['motDePasse', PASSWORD]]) await dialog(page).locator(`#${id}`).fill(value);
};
const failInserts = (page: Page) => page.route('**/rest/v1/techniciens*', route => (
  route.request().method() === 'POST' ? route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint' } }) : route.fallback()
));

test.describe('Création', () => {
  test('fiche refusée : le compte créé à l’instant est retiré', async ({ page }) => {
    const { calls } = await open(page, 'techniciens', body => ({ json: body.action === 'create' ? { user: { id: 'auth-neuf' }, created: true } : { ok: true } }));
    await failInserts(page);
    await create(page);
    await dialog(page).getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect.poll(() => calls.map(({ action, userId, table }) => [action, userId, table])).toEqual([['create', undefined, 'techniciens'], ['delete', 'auth-neuf', 'techniciens']]);
  });

  test('fiche refusée : un compte qui existait déjà n’est jamais supprimé', async ({ page }) => {
    const { calls } = await open(page, 'techniciens', () => ({ json: { user: { id: 'auth-autre' }, reused: true, passwordKept: true } }));
    await failInserts(page);
    await create(page);
    await dialog(page).getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Enregistrement impossible').first()).toBeVisible();
    expect(calls.map(({ action }) => action)).toEqual(['create']);
  });

  test('e-mail déjà utilisé : refus, aucune fiche', async ({ page }) => {
    const { calls, writesTo } = await open(page, 'techniciens', () => ({ status: 409, json: { error: 'Cet e-mail est déjà utilisé par un autre compte.' } }));
    await create(page);
    await dialog(page).getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText('Cet e-mail est déjà utilisé par un autre compte.', { exact: true }).first()).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(writesTo('techniciens')).toEqual([]);
  });

  test('personne ayant déjà un compte : fiche créée, mot de passe annoncé inchangé', async ({ page }) => {
    const { writesTo } = await open(page, 'techniciens', () => ({ json: { user: { id: 'auth-autre' }, reused: true, passwordKept: true } }));
    await create(page);
    await dialog(page).getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByText(/avec son mot de passe actuel/).first()).toBeVisible();
    expect(writesTo('techniciens')[0].body).toMatchObject({ matricule: 'T9', auth_user_id: 'auth-autre' });
    expect(JSON.stringify(writesTo('techniciens'))).not.toContain(PASSWORD);
  });
});

test('supprimer une guichetière supprime aussi son compte', async ({ page }) => {
  const { calls, writesTo } = await open(page, 'guichetieres');
  const row = page.getByRole('row').filter({ hasText: 'Kouyaté' });
  await row.getByRole('button', { name: /^Supprimer/ }).click();
  await expect(dialog(page).or(page.getByRole('dialog')).first()).toContainText("compte d'accès");
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect.poll(() => writesTo('guichetieres').length).toBe(1);
  expect(calls).toEqual([{ action: 'delete', userId: 'auth-g1', table: 'guichetieres', jwt: true }]);
  expect(writesTo('guichetieres')[0].body).toMatchObject({ is_current: false, auth_user_id: null });
});

const IMPORTS = [
  { screen: 'guichetieres', table: 'guichetieres', input: '#import-guichetieres', csv: 'matricule;codePrepose;nom;prenom;mdpPrepose;agenceAssigne\nG8;P8;Ba;Awa;secret-import;Gombe' },
  { screen: 'chefs-agence', table: 'chefs_agence', input: '#import-chefs', csv: 'matricule;nom;prenom;mdp;agenceEnCharge\nC8;Ba;Awa;secret-import;Gombe' },
  { screen: 'chefs-secteur', table: 'chefs_secteur', input: '#import-chefs-secteur', csv: 'matricule;nom;prenom;mdp;secteurEnCharge\nS8;Ba;Awa;secret-import;Centre' },
  { screen: 'techniciens', table: 'techniciens', input: '#import-techniciens', csv: 'matricule;nom;prenom;email;motDePasse\nT8;Ba;Awa;awa@exemple.test;secret-import' },
];
for (const { screen, table, input, csv } of IMPORTS) {
  test(`import ${screen} : sans mot de passe, avec ou sans la colonne`, async ({ page }) => {
    const { writesTo, calls } = await open(page, screen);
    const notice = page.getByText('Les mots de passe du fichier ne sont pas enregistrés', { exact: false }).first();
    const upload = (text: string) => page.locator(input).setInputFiles({ name: 'import.csv', mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
    await upload(csv);
    await expect(notice).toBeVisible();
    await expect.poll(() => writesTo(table).length).toBe(1);

    const [header, line] = csv.split('\n').map(row => row.split(';'));
    const column = header.findIndex(name => /^(mdp|motDePasse)/.test(name));
    const without = [header, line.map(value => (/^[GCST]8$/.test(value) ? 'N9' : value))].map(row => row.filter((_, index) => index !== column).join(';')).join('\n');
    await upload(without);
    await expect.poll(() => writesTo(table).length).toBe(2);
    await expect(page.getByText(/import/i).first()).toBeVisible();
    await expect(notice).toHaveCount(0);

    const sent = JSON.stringify(writesTo(table));
    expect(sent).not.toContain('secret-import');
    expect(sent).not.toMatch(/"(mdp|mdpPrepose|motDePasse)"/);
    expect(writesTo(table).map(({ body }) => body[0].matricule)).toEqual([line[0], 'N9']);
    expect(calls).toEqual([]);
  });
}
