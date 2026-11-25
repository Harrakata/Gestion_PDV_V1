import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAccountsRepository } from '../../src/features/comptes/accountsRepository.js';
import { hasPasswordColumn } from '../../src/lib/csv.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const setup = (answer = {}, { session = { access_token: 'jeton' } } = {}) => {
  const calls = [];
  const client = {
    auth: { getSession: async () => ({ data: { session } }) },
    functions: { invoke: async (name, options) => {
      calls.push({ name, ...options });
      return typeof answer === 'function' ? answer(options.body) : { data: answer, error: null };
    } },
  };
  return { calls, accounts: createAccountsRepository(client, 'guichetieres') };
};
const bodies = (calls) => calls.map(({ body }) => body);
const rejects = (promise, title, message) => assert.rejects(promise, (error) => {
  assert.equal(error.title, title);
  assert.equal(error.message, message);
  return true;
});
const PASSWORD = 'MotDePasse!1';

test('création : le compte créé est signalé comme tel', async () => {
  const { calls, accounts } = setup({ user: { id: 'u1' }, created: true });
  assert.deepEqual(await accounts.sync({ current: null, email: ' A@X.test ', password: ` ${PASSWORD} ` }), { userId: 'u1', created: true, notice: '' });
  assert.deepEqual(bodies(calls), [{ action: 'create', email: 'a@x.test', password: PASSWORD, table: 'guichetieres' }]);
  assert.deepEqual(calls[0].headers, { Authorization: 'Bearer jeton' });
});

test('fonction serveur pas encore à jour : un compte réutilisé n’est jamais pris pour un nouveau', async () => {
  assert.equal((await setup({ user: { id: 'u1' } }).accounts.sync({ current: null, email: 'a@x.test', password: PASSWORD })).created, true);
  assert.equal((await setup({ user: { id: 'u1' }, reused: true }).accounts.sync({ current: null, email: 'a@x.test', password: PASSWORD })).created, false);
});

test('échec d’enregistrement : seul un compte créé à l’instant est retiré', async () => {
  const { calls, accounts } = setup({ ok: true });
  await accounts.undo({ userId: 'u1', created: false });
  await accounts.undo(undefined);
  assert.deepEqual(calls, []);
  await accounts.undo({ userId: 'u1', created: true });
  assert.deepEqual(bodies(calls), [{ action: 'delete', userId: 'u1', table: 'guichetieres' }]);
  await setup(() => ({ data: null, error: new Error('panne') })).accounts.undo({ userId: 'u1', created: true }); // sans erreur
});

test('modification : seul ce qui change est envoyé', async () => {
  const current = { auth_user_id: 'u1', email: 'A@x.test' };
  const same = setup();
  assert.deepEqual(await same.accounts.sync({ current, email: 'a@X.test', password: '' }), { userId: 'u1', created: false, notice: '' });
  assert.deepEqual(same.calls, []);

  const both = setup();
  await both.accounts.sync({ current, email: 'b@x.test', password: PASSWORD });
  assert.deepEqual(bodies(both.calls), [
    { action: 'updatePassword', userId: 'u1', password: PASSWORD, table: 'guichetieres' },
    { action: 'updateEmail', userId: 'u1', email: 'b@x.test', table: 'guichetieres' },
  ]);
});

test('fiche sans compte : créé seulement si un mot de passe est saisi', async () => {
  const { calls, accounts } = setup({ user: { id: 'u2' }, reused: true, passwordKept: true });
  assert.deepEqual(await accounts.sync({ current: { auth_user_id: null, email: 'a@x.test' }, email: 'a@x.test', password: ' ' }), { userId: null, created: false, notice: '' });
  assert.deepEqual(calls, []);
  const account = await accounts.sync({ current: { email: 'a@x.test' }, email: 'a@x.test', password: PASSWORD });
  assert.equal(account.userId, 'u2');
  assert.match(account.notice, /mot de passe actuel/);
});

test('refus et pannes : message du serveur, sinon message simple', async () => {
  const http = (body) => () => ({ data: null, error: { message: 'non-2xx', context: { json: async () => body } } });
  await rejects(setup(http({ error: 'Cet e-mail est déjà utilisé par un autre compte.' })).accounts.sync({ current: null, email: 'a@x.test', password: PASSWORD }), 'Erreur création du compte', 'Cet e-mail est déjà utilisé par un autre compte.');
  await rejects(setup(() => ({ data: null, error: new Error('Failed to send a request to the Edge Function') })).accounts.remove('u1'), 'Suppression refusée', "Impossible de supprimer le compte d'accès.");
  await rejects(setup({ error: 'Compte introuvable.' }).accounts.setPassword('u1', PASSWORD), 'Erreur réinitialisation', 'Compte introuvable.');
  await rejects(setup({}).accounts.sync({ current: null, email: 'a@x.test', password: PASSWORD }), 'Erreur création du compte', "Impossible de créer le compte d'accès.");

  const offline = setup({}, { session: null });
  await rejects(offline.accounts.remove('u1'), 'Suppression refusée', 'Votre session a expiré. Veuillez vous reconnecter.');
  const short = setup({});
  await rejects(short.accounts.sync({ current: { auth_user_id: 'u1', email: 'a@x.test' }, email: 'a@x.test', password: 'court' }), 'Mot de passe trop court', 'Au moins 8 caractères requis.');
  await rejects(short.accounts.sync({ current: null, email: 'a@x.test', password: undefined }), 'Mot de passe trop court', 'Au moins 8 caractères requis.');
  assert.deepEqual([...offline.calls, ...short.calls], []);
});

test('fichier CSV : la colonne de mots de passe est reconnue', () => {
  for (const header of ['mdp', 'MDP', 'mdpPrepose', 'motDePasse', 'mot_de_passe', ' password ']) assert.equal(hasPasswordColumn(['matricule', header]), true, header);
  assert.equal(hasPasswordColumn(['matricule', 'nom', 'codePrepose']), false);
});

// Aucun écran ne lit ni n'enregistre de mot de passe dans une fiche, ni ne gère un compte à côté du dépôt.
test('écrans : ni mot de passe en clair, ni appel direct', () => {
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
  for (const file of files(path.join(root, 'src')).filter((name) => /\.jsx?$/.test(name))) {
    const source = readFileSync(file, 'utf8');
    const name = path.relative(root, file);
    assert.doesNotMatch(source, /select\([^)]*\b(mdp|mdpPrepose|motDePasse)\b/, `${name} : mot de passe lu en base`);
    assert.doesNotMatch(source, /\b(mdp|mdpPrepose|motDePasse):\s*(obj|row|record|currentRow)\./, `${name} : mot de passe enregistré`);
    assert.doesNotMatch(source, /(record|row|payload|dataToSave|item).(mdp|mdpPrepose|motDePasse)s*=[^=]/, `${name} : mot de passe enregistré`);
    if (!file.endsWith('accountsRepository.js')) assert.doesNotMatch(source, /['"]admin-manage-user['"]/, `${name} : appel direct`);
  }
});
