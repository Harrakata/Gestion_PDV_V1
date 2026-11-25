import test from 'node:test';
import assert from 'node:assert/strict';

import { manageAccount } from '../../supabase/functions/_shared/accountManager.js';

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MENUS = ['profils-exploitation', 'guichetieres', 'techniciens', 'chefs-agence', 'chefs-secteur', 'validation-paiement-gain', 'direction-generale'];
const all = (level) => Object.fromEntries(MENUS.map((menu) => [menu, level]));
const only = (...menus) => ({ ...all('none'), ...Object.fromEntries(menus.map((menu) => [menu, 'write'])) });
const ACCOUNTS = {
  admin: 1, lecteur: 2, rh: 3, inactif: 4, directions: 5, chef: 11, deux: 12, guichetiere: 21, general: 31, regional: 32, technicien: 41, orphelin: 51, ailleurs: 61,
};
const emailOf = (name) => `${name}@x.test`;

/** Base et comptes simulés ; `calls` : ce qui a réellement été fait sur les comptes. */
const world = ({ missingTables = [], broken = [], profiles = true, authError = null } = {}) => {
  const users = new Map(Object.entries(ACCOUNTS).map(([name, n]) => [uid(n), { id: uid(n), email: emailOf(name) }]));
  const profile = (name, permissions, statut = 'Actif') => ({ id: ACCOUNTS[name], email: emailOf(name), statut, auth_user_id: uid(ACCOUNTS[name]), permissions });
  const tables = {
    profils_exploitation: profiles ? [
      profile('admin', all('write')),
      profile('lecteur', all('read')),
      profile('rh', JSON.stringify(only('guichetieres', 'chefs-agence'))),
      profile('inactif', only('guichetieres'), 'Inactif'),
      profile('directions', only('validation-paiement-gain')),
    ] : [],
    chefs_agence: [
      { id: 101, email: emailOf('chef'), auth_user_id: uid(11), is_current: true },
      { id: 102, email: emailOf('deux'), auth_user_id: uid(12), is_current: true },
      { id: 103, email: 'ancien@x.test', auth_user_id: uid(51), is_current: false },
      { id: 104, email: ' Nouveau_Chef@X.test ', auth_user_id: null, is_current: true },
    ],
    guichetieres: [
      { id: 201, email: emailOf('guichetiere'), auth_user_id: uid(21), is_current: true },
      { id: 202, email: emailOf('deux'), auth_user_id: uid(12), is_current: true },
      { id: 203, email: 'a-rattacher@x.test', auth_user_id: null, is_current: true },
    ],
    chefs_secteur: [],
    techniciens: [
      { id: 401, email: emailOf('technicien'), auth_user_id: uid(41) },
      { id: 402, email: 'autre-adresse@x.test', auth_user_id: uid(61) },
    ],
    validateurs_paiement_gain: [
      { id: 301, email: emailOf('general'), auth_user_id: uid(31), fonction: 'Directeur général' },
      { id: 302, email: emailOf('regional'), auth_user_id: uid(32), fonction: 'Directeur régional' },
    ],
  };
  const calls = [];
  const taken = (email, id) => [...users.values()].some((user) => user.email === email && user.id !== id);
  const alreadyUsed = { status: 422, code: 'email_exists', message: 'A user with this email address has already been registered' };
  const admin = {
    from: (table) => {
      let rows = tables[table];
      const result = () => {
        if (missingTables.includes(table)) return { data: null, error: { code: 'PGRST205', message: 'absente' } };
        if (broken.includes(table)) return { data: null, count: null, error: { code: '57014', message: 'panne' } };
        return { data: rows, count: rows.length, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (column, value) => { rows = rows.filter((row) => row[column] === value); return builder; },
        ilike: (column, pattern) => {
          const part = pattern.slice(1, -1).replace(/\\(.)/g, '$1').toLowerCase();
          rows = rows.filter((row) => String(row[column] ?? '').toLowerCase().includes(part));
          return builder;
        },
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    },
    auth: { admin: {
      getUserById: async (id) => {
        if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Expected parameter to be UUID');
        if (users.has(id)) return { data: { user: users.get(id) }, error: null };
        return { data: { user: null }, error: { status: 404, code: 'user_not_found', message: 'User not found' } };
      },
      listUsers: async ({ page, perPage }) => {
        const everyone = [...Array.from({ length: 1500 }, (_, n) => ({ id: uid(90000 + n), email: `bruit${n}@x.test` })), ...users.values()];
        return { data: { users: everyone.slice((page - 1) * perPage, page * perPage) }, error: null };
      },
      createUser: async ({ email, password }) => {
        if (authError) return { data: { user: null }, error: authError };
        if (taken(email)) return { data: { user: null }, error: alreadyUsed };
        calls.push(['create', email, password]);
        return { data: { user: { id: uid(999), email } }, error: null };
      },
      updateUserById: async (id, changes) => {
        if (changes.email && taken(changes.email, id)) return { error: alreadyUsed };
        calls.push(['update', id, changes]);
        return { error: null };
      },
      deleteUser: async (id) => { calls.push(['delete', id]); return { error: null }; },
    } },
  };
  return { admin, calls };
};

const run = async (who, body, options) => {
  const { admin, calls } = world(options);
  const logs = [];
  const { status, body: answer } = await manageAccount({ admin, caller: { id: uid(ACCOUNTS[who] ?? 900) }, body, log: (error) => logs.push(error) });
  return { status, answer, calls, logs };
};
const PASSWORD = 'MotDePasse!1';
const refused = async (who, body, status = 403, options = {}) => {
  const result = await run(who, body, options);
  assert.equal(result.status, status, `${who} ${JSON.stringify(body)} : ${JSON.stringify(result.answer)}`);
  assert.ok(result.answer.error);
  assert.deepEqual(result.calls, []);
  return result;
};

test('prise de contrôle : le droit d’écriture sur la fiche visée est exigé', async () => {
  for (const who of ['lecteur', 'inactif', 'guichetiere', 'inconnu', 'rh', 'directions']) {
    for (const table of [undefined, 'profils_exploitation', 'guichetieres']) {
      await refused(who, { action: 'updatePassword', userId: uid(1), password: PASSWORD, table });
      await refused(who, { action: 'updateEmail', userId: uid(1), email: 'pirate@x.test', table });
      await refused(who, { action: 'delete', userId: uid(1), table });
    }
  }
  // Lecture seule partout : rien, sur aucun compte.
  for (const name of Object.keys(ACCOUNTS)) await refused('lecteur', { action: 'updatePassword', userId: uid(ACCOUNTS[name]), password: PASSWORD });
  for (const who of ['lecteur', 'inactif']) {
    await refused(who, { action: 'create', email: 'libre@x.test', password: PASSWORD, table: 'guichetieres' });
    await refused(who, { action: 'updatePassword', userId: uid(21), password: PASSWORD, table: 'guichetieres' });
  }
});

test('directeur général et directeur régional : menus distincts', async () => {
  await refused('directions', { action: 'updatePassword', userId: uid(31), password: PASSWORD, table: 'validateurs_paiement_gain' });
  const { status, calls } = await run('directions', { action: 'updatePassword', userId: uid(32), password: PASSWORD, table: 'validateurs_paiement_gain' });
  assert.equal(status, 200);
  assert.deepEqual(calls, [['update', uid(32), { password: PASSWORD }]]);
});

test('usage normal : chacun gère les fiches de ses menus', async () => {
  assert.deepEqual((await run('rh', { action: 'updatePassword', userId: uid(21), password: PASSWORD, table: 'guichetieres' })).calls, [['update', uid(21), { password: PASSWORD }]]);
  assert.deepEqual((await run('rh', { action: 'updateEmail', userId: uid(21), email: ' Autre@X.test ', table: 'guichetieres' })).calls, [['update', uid(21), { email: 'autre@x.test' }]]);
  assert.deepEqual((await run('rh', { action: 'delete', userId: uid(21), table: 'guichetieres' })).calls, [['delete', uid(21)]]);
  const created = await run('rh', { action: 'create', email: 'Libre@X.test', password: PASSWORD, table: 'guichetieres' });
  assert.deepEqual(created.calls, [['create', 'libre@x.test', PASSWORD]]);
  assert.deepEqual(created.answer, { user: { id: uid(999), email: 'libre@x.test' }, created: true });
  assert.equal((await run('admin', { action: 'updatePassword', userId: uid(2), password: PASSWORD, table: 'profils_exploitation' })).status, 200);
});

test('application pas encore à jour (sans « table ») : les actions courantes passent', async () => {
  assert.equal((await run('rh', { action: 'create', email: 'libre@x.test', password: PASSWORD })).status, 200);
  assert.equal((await run('rh', { action: 'updatePassword', userId: uid(21), password: PASSWORD })).status, 200);
  assert.equal((await run('rh', { action: 'delete', userId: uid(21) })).status, 200);
});

test('création : jamais sur le compte d’une autre personne', async () => {
  for (const name of ['admin', 'guichetiere', 'general', 'technicien', 'ailleurs']) {
    for (const table of [undefined, 'guichetieres']) {
      const { status, answer, calls } = await run('rh', { action: 'create', email: emailOf(name), password: PASSWORD, table });
      assert.ok([403, 409].includes(status), `${name} ${table} : ${status}`);
      assert.ok(answer.error);
      assert.deepEqual(calls, []);
    }
  }
  await refused('admin', { action: 'create', email: emailOf('guichetiere'), password: PASSWORD, table: 'guichetieres' }, 409);
  await refused('admin', { action: 'create', email: emailOf('technicien'), password: PASSWORD }, 409);
});

test('e-mail d’une fiche pas encore rattachée : réservé à qui gère cette fiche', async () => {
  await refused('directions', { action: 'create', email: 'a-rattacher@x.test', password: PASSWORD, table: 'validateurs_paiement_gain' });
  await refused('directions', { action: 'create', email: 'nouveau_chef@x.test', password: PASSWORD, table: 'validateurs_paiement_gain' });
  await refused('directions', { action: 'updateEmail', userId: uid(32), email: 'nouveau_chef@x.test', table: 'validateurs_paiement_gain' });
  assert.equal((await run('rh', { action: 'create', email: 'nouveau_chef@x.test', password: PASSWORD, table: 'chefs_agence' })).status, 200);
  // « _ » et « % » ne sont pas des jokers : nouveauxchef n’est pas nouveau_chef.
  assert.equal((await run('directions', { action: 'create', email: 'nouveauxchef@x.test', password: PASSWORD, table: 'validateurs_paiement_gain' })).status, 200);
  assert.equal((await run('directions', { action: 'create', email: 'rattacher@x.test', password: PASSWORD, table: 'validateurs_paiement_gain' })).status, 200);
});

test('une personne, deux rôles : compte réutilisé, mot de passe inchangé', async () => {
  const { status, answer, calls } = await run('admin', { action: 'create', email: emailOf('technicien'), password: PASSWORD, table: 'guichetieres' });
  assert.equal(status, 200);
  assert.deepEqual(answer, { user: { id: uid(41), email: emailOf('technicien') }, reused: true, passwordKept: true });
  assert.deepEqual(calls, []);
});

test('compte sans fiche (ou fiche archivée) : repris, trouvé au-delà de la première page', async () => {
  const { answer, calls } = await run('rh', { action: 'create', email: emailOf('orphelin'), password: PASSWORD, table: 'chefs_agence' });
  assert.deepEqual(answer, { user: { id: uid(51), email: emailOf('orphelin') }, reused: true });
  assert.deepEqual(calls, [['update', uid(51), { password: PASSWORD, email_confirm: true }]]);
});

test('suppression : un compte utilisé par une autre fiche est conservé', async () => {
  const kept = await run('rh', { action: 'delete', userId: uid(12), table: 'guichetieres' });
  assert.deepEqual([kept.status, kept.answer, kept.calls], [200, { ok: true, kept: true }, []]);
  await refused('rh', { action: 'delete', userId: uid(12) }, 409);
  await refused('admin', { action: 'delete', userId: uid(1), table: 'profils_exploitation' }, 400);
  const missing = await run('rh', { action: 'delete', userId: uid(777), table: 'guichetieres' });
  assert.deepEqual([missing.status, missing.answer, missing.calls], [200, { ok: true, missing: true }, []]);
  assert.deepEqual((await run('rh', { action: 'delete', userId: uid(51), table: 'chefs_agence' })).calls, [['delete', uid(51)]]);
});

test('mise en service : le premier compte peut créer son profil, plus personne ensuite', async () => {
  const body = { action: 'create', email: 'premier@x.test', password: PASSWORD, table: 'profils_exploitation' };
  assert.equal((await run('inconnu', body, { profiles: false })).status, 200);
  await refused('inconnu', body);
});

test('droits ou fiches illisibles : refus, jamais d’accès par défaut', async () => {
  const body = { action: 'updatePassword', userId: uid(21), password: PASSWORD, table: 'guichetieres' };
  for (const table of ['profils_exploitation', 'chefs_agence', 'validateurs_paiement_gain']) {
    const { answer, logs } = await refused('admin', body, 500, { broken: [table] });
    assert.doesNotMatch(answer.error, /panne/);
    assert.equal(logs.length, 1);
  }
  await refused('inconnu', { action: 'create', email: 'libre@x.test', password: PASSWORD }, 500, { broken: ['profils_exploitation'], profiles: false });
  assert.equal((await run('rh', body, { missingTables: ['chefs_secteur'] })).status, 200);
});

test('demandes invalides', async () => {
  const create = { action: 'create', email: 'a@x.test', password: PASSWORD };
  const cases = [
    [null, 400], [{}, 400], [{ action: 'constructor' }, 400],
    [{ ...create, email: 'x' }, 400], [{ ...create, password: 'court' }, 400], [{ ...create, password: undefined }, 400],
    [{ ...create, table: 'app_settings' }, 400], [{ ...create, table: 'toString' }, 400],
    [{ action: 'updatePassword', userId: 'pas-un-identifiant', password: PASSWORD }, 404],
    [{ action: 'updatePassword', userId: uid(777), password: PASSWORD }, 404],
    [{ action: 'updatePassword', password: PASSWORD }, 404],
    [{ action: 'updateEmail', userId: uid(21), email: emailOf('orphelin') }, 409],
  ];
  for (const [body, status] of cases) await refused('admin', body, status);
  await refused('admin', { ...create, password: 'aaaaaaaa' }, 400, { authError: { code: 'weak_password', message: 'Password is known to be weak' } });
});
