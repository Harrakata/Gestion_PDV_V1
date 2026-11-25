// Règles de sécurité du lot A, exécutées sur un vrai PostgreSQL (PGlite), rôle par rôle : ce qui
// doit passer, ce qui doit être refusé. Structure reprise du dépôt ; aucune base réelle.
//
//   npm install --no-save @electric-sql/pglite && node --test tests/db/securite-lot-a.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { normalizeExploitationPermissions, EXPLOITATION_MENU_PERMISSIONS } from '../../src/lib/exploitationProfiles.js';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(import.meta.dirname, '../..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202611261200_securite_lot_a.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'scripts/securite/lot-a-retour-arriere.sql'), 'utf8');

const SCHEMA = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
create table agences (id bigserial primary key, nom text, "codePDV" text, region text, secteur text, is_current boolean default true);
create table profils_exploitation (id bigserial primary key, nom text, prenom text, email text, telephone text, statut text default 'Actif', permissions jsonb default '{}', photo_url text, auth_user_id uuid, updated_at timestamptz default now());
create table profil_utilisateur_templates (id bigserial primary key, nom text);
create table chefs_agence (id bigserial primary key, matricule text, nom text, prenom text, email text, telephone text, mdp text, "agenceEnCharge" text, "codePDV" text, photo_url text, auth_user_id uuid, is_current boolean not null default true, valid_from timestamptz, valid_to timestamptz, updated_at timestamptz);
create table guichetieres (id uuid primary key default gen_random_uuid(), matricule text, "codePrepose" text, nom text, prenom text, email text, telephone text, "agenceAssigne" text, photo_url text, auth_user_id uuid, is_current boolean not null default true);
create table guichetiere_agence_history (id bigserial primary key, code_prepose text, agence_assignee text, valid_from date, valid_to date);
create table techniciens (id bigserial primary key, matricule text, nom text, prenom text, email text, telephone text, photo_url text, auth_user_id uuid);
create table chefs_secteur (id uuid primary key default gen_random_uuid(), matricule text, nom text, prenom text, email text, telephone text, "secteurEnCharge" text, photo_url text, auth_user_id uuid, is_current boolean not null default true);
create table validateurs_paiement_gain (id bigserial primary key, fonction text, nom text, prenom text, email text, telephone text, "regionAssignee" text, statut text default 'Actif', auth_user_id uuid, photo_url text);
create table paiement_gain_workflow_config (id bigserial primary key, ordre int default 1, "codeWorkflow" text, libelle text, "montantMin" numeric default 0, "montantMax" numeric, "requiresChefApproval" boolean default false, "requiresRegionalApproval" boolean default false, "requiresGeneralApproval" boolean default false, statut text default 'Actif');
create table demandes_paiement_gain (id bigserial primary key, "codeDemande" text, "montantGain" numeric(18,2) not null, "circuitValidation" text, "statutGlobal" text not null, "niveauValidationCourant" text not null, "chefAgenceId" bigint, "chefAgenceMatricule" text, "agenceOrigineNom" text, "directeurRegionalId" bigint, "directeurRegionalRegion" text, "directeurGeneralId" bigint, "photoPieceUrl" text, "agencePaiementNom" text, "agencePaiementCodePDV" text, "nomGagnant" text, "dateValidationChef" timestamptz, "dateValidationDirecteurRegional" timestamptz, "dateValidationDirecteurGeneral" timestamptz, "dateAutorisationExploitation" timestamptz, "datePaiementFinal" timestamptz, "commentaireDerniereAction" text, updated_at timestamptz default now());
create table paiement_gain_workflow_events (id bigserial primary key, "demandeId" bigint, "codeDemande" text, "actionType" text);
create table app_settings (id bigserial primary key, key text, value jsonb);
create table salaire_config_historique (id bigserial primary key, type text, is_current boolean, date_debut date, date_fin date);
create table objectifs_salaire (id bigserial primary key, level text, target_key text, target_value numeric, group_id uuid, target_distribution jsonb);
create table versements_guichetieres (id bigserial primary key, guichetiere_code text, date_versement date, montant numeric);
create function handle_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger handle_demandes before update on demandes_paiement_gain for each row execute function handle_updated_at();
create function change_guichetiere_agence(p_code text, p_agence text) returns void language plpgsql security definer as $$
begin update guichetieres set "agenceAssigne" = p_agence where "codePrepose" = p_code; insert into guichetiere_agence_history (code_prepose, agence_assignee) values (p_code, p_agence); end $$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
-- Règles actuelles, très ouvertes.
alter table profils_exploitation enable row level security;
create policy ouvert on profils_exploitation for all using (true) with check (true);
alter table app_settings enable row level security;
create policy "Enable all for anon" on app_settings for all to anon using (true) with check (true);
create policy connectes on app_settings for all to authenticated using (true) with check (true);
`;

const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ACCOUNTS = {
  admin: [1, 'admin@x.test'], lecteur: [2, 'lecteur@x.test'], autorise: [3, 'autorise@x.test'], chef: [11, 'chef@x.test'], chefPayeur: [12, 'payeur@x.test'], chefNonLie: [13, 'nonlie@x.test'],
  chefInactif: [14, 'inactif@x.test'], dr: [21, 'dr@x.test'], drSud: [22, 'drsud@x.test'], dg: [23, 'dg@x.test'], dgAutre: [24, 'dg2@x.test'], guichetiere: [31, 'gui@x.test'], nouvelle: [32, 'nouvelle@x.test'],
  technicien: [41, 'tech@x.test'], chefSecteur: [51, 'secteur@x.test'], inconnu: [99, 'inconnu@x.test'],
};
const WRITE = Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path: menu }) => [menu, 'write']));
const READ = Object.fromEntries(EXPLOITATION_MENU_PERMISSIONS.map(({ path: menu }) => [menu, 'read']));
const SEED = `
insert into agences (nom, "codePDV", region, secteur) values ('Gombe', '001', 'Nord', 'S1'), ('Limete', '002', 'Nord', 'S1'), ('Matadi', '003', 'Sud', 'S2');
insert into profils_exploitation (nom, email, permissions, auth_user_id) values
  ('Admin', 'admin@x.test', '${JSON.stringify(WRITE)}', '${uid(1)}'), ('Lecteur', 'lecteur@x.test', '${JSON.stringify(READ)}', '${uid(2)}'),
  ('Autorise', 'autorise@x.test', '${JSON.stringify({ ...READ, 'autorisation-paiement-gain': 'write' })}', '${uid(3)}');
insert into chefs_agence (id, matricule, nom, email, "agenceEnCharge", "codePDV", auth_user_id, is_current) values
  (101, 'C1', 'Chef', 'chef@x.test', 'Gombe', '001', '${uid(11)}', true), (100, 'C1', 'Chef ancien', 'chef@x.test', 'Limete', '002', null, false),
  (102, 'C2', 'Payeur', 'payeur@x.test', 'Limete', '002', '${uid(12)}', true), (103, 'C3', 'NonLie', 'NonLie@x.test', 'Matadi', '003', null, true),
  (104, 'C4', 'Inactif', 'inactif@x.test', 'Gombe', '001', '${uid(14)}', true);
insert into guichetieres (matricule, "codePrepose", nom, email, "agenceAssigne", auth_user_id) values ('G1', 'P1', 'Gui', 'gui@x.test', 'Gombe', '${uid(31)}'), ('G2', 'P2', 'Nouvelle', 'Nouvelle@x.test', 'Limete', null), ('G3', 'P3', 'Loin', 'loin@x.test', 'Matadi', null);
insert into guichetiere_agence_history (code_prepose, agence_assignee) values ('P2', 'Gombe');
insert into techniciens (nom, email, auth_user_id) values ('Tech', 'tech@x.test', '${uid(41)}');
insert into chefs_secteur (nom, email, "secteurEnCharge", auth_user_id) values ('CS', 'secteur@x.test', 'S1', '${uid(51)}');
insert into validateurs_paiement_gain (id, fonction, nom, email, "regionAssignee", auth_user_id) values
  (21, 'Directeur régional', 'DR', 'dr@x.test', 'Nord', '${uid(21)}'), (22, 'Directeur régional', 'DRSud', 'drsud@x.test', 'Sud', '${uid(22)}'),
  (23, 'Directeur général', 'DG', 'dg@x.test', null, '${uid(23)}'), (24, 'Directeur général', 'DG2', 'dg2@x.test', null, '${uid(24)}');
insert into app_settings (key, value) values ('general', '{"a":1}'), ('profils_espaces_utilisateurs', '{"espace-chef-agence": {"104": {"statut": "Inactif"}, "101": {"statut": "Actif"}}}'), ('notification_settings', '{}');
insert into salaire_config_historique (type) values ('salaire');
insert into objectifs_salaire (level, target_key, target_value) values ('agence', 'Gombe', 10), ('agence', 'Limete', 10), ('region', 'Nord', 10), ('national', 'national', 10);
insert into versements_guichetieres (guichetiere_code, date_versement, montant) values ('P1', '2026-11-01', 100), ('P3', '2026-11-01', 100);
select setval('chefs_agence_id_seq', 500); select setval('validateurs_paiement_gain_id_seq', 500);
`;

const open = async (mode = 'enforce') => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED);
  await db.exec(migration);
  if (mode === 'enforce') await db.exec("select app_security.set_mode('enforce')");

  /** Exécute comme le ferait l'API pour cet appelant. */
  const as = async (who, sql) => {
    const account = ACCOUNTS[who];
    const claims = account ? { sub: uid(account[0]), email: account[1], role: 'authenticated' } : { role: who };
    await db.exec(`begin; set local role ${account ? 'authenticated' : who}; select set_config('request.jwt.claims', '${JSON.stringify(claims)}', true)`);
    try {
      const result = await db.query(sql);
      await db.exec('commit');
      return result;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  };
  const ok = async (who, sql, label = sql) => {
    const result = await as(who, sql).catch((error) => assert.fail(`${who} devrait pouvoir : ${label}\n  → ${error.message}`));
    assert.ok(result.affectedRows >= 1 || result.rows.length, `${who} : aucune ligne touchée par ${label}`);
    return result;
  };
  const no = (who, sql, pattern = /Action non autorisée/) => assert.rejects(as(who, sql), (error) => {
    assert.match(error.message, pattern, `${who} ${sql}`);
    assert.equal(error.code, '42501');
    return true;
  }, `${who} ne devrait pas pouvoir : ${sql}`);
  const one = async (sql) => (await db.query(sql)).rows[0];
  return { db, as, ok, no, one };
};
const quote = (value) => (value === null ? 'null' : `'${String(value).replace(/'/g, "''")}'`);
const insert = (table, row) => `insert into ${table} (${Object.keys(row).map((key) => `"${key}"`).join(', ')}) values (${Object.values(row).map(quote).join(', ')}) returning id`;
const update = (table, row, where) => `update ${table} set ${Object.entries(row).map(([key, value]) => `"${key}" = ${quote(value)}`).join(', ')} where ${where}`;

const REGIONAL = { statutGlobal: 'En attente directeur régional', niveauValidationCourant: 'directeur_regional' };
const GENERAL = { statutGlobal: 'En attente directeur général', niveauValidationCourant: 'directeur_general' };
const EXPLOITATION = { statutGlobal: 'En attente exploitation', niveauValidationCourant: 'exploitation' };
const PAID = { statutGlobal: 'Payée', niveauValidationCourant: 'terminee', datePaiementFinal: '2026-11-26' };
const REJECTED = { statutGlobal: 'Refusée', niveauValidationCourant: 'terminee', commentaireDerniereAction: 'non' };
const AUTHORIZED = { statutGlobal: 'Autorisée pour paiement', niveauValidationCourant: 'agence_paiement', agencePaiementNom: 'Limete', agencePaiementCodePDV: '002', dateAutorisationExploitation: '2026-11-26', commentaireDerniereAction: 'ok' };
const demande = (extra = {}) => ({ codeDemande: 'PGG', montantGain: 60000000, circuitValidation: 'Chef d’agence > Directeur régional > Directeur général > Exploitation > Paiement en agence', ...REGIONAL, chefAgenceId: 101, chefAgenceMatricule: 'C1', agenceOrigineNom: 'Gombe', directeurRegionalId: 21, directeurRegionalRegion: 'Nord', directeurGeneralId: 23, ...extra });

test('installation : idempotente, en observation, et retour arrière complet', async () => {
  const { db, as, one } = await open('observe');
  await db.exec(migration);
  assert.equal((await one('select mode from app_security.config')).mode, 'observe');
  await db.exec("select app_security.set_mode('enforce')");
  await db.exec(migration);
  assert.equal((await one('select mode from app_security.config')).mode, 'enforce', 'le mode en place est conservé');
  assert.equal(Number((await one("select count(*) n from pg_trigger where tgname = 'aa_app_security'")).n), 15);
  await db.exec(rollback);
  assert.equal(Number((await one("select count(*) n from pg_trigger where tgname = 'aa_app_security'")).n), 0);
  assert.equal((await one("select to_regnamespace('app_security') s")).s, null);
  await as('anon', update('profils_exploitation', { nom: 'X' }, 'id = 1')); // état d'origine
});

test('structure inattendue : rien n’est installé', async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec('alter table chefs_agence drop column "codePDV"');
  await assert.rejects(db.exec(migration), /chefs_agence\.codePDV/);
  assert.equal((await db.query("select to_regnamespace('app_security') s")).rows[0].s, null);
});

test('table facultative absente : ignorée', async () => {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec('drop table guichetiere_agence_history, objectifs_salaire, profil_utilisateur_templates');
  await db.exec(migration);
  await db.exec("select app_security.set_mode('enforce')");
  assert.equal(Number((await db.query("select count(*) n from pg_trigger where tgname = 'aa_app_security'")).rows[0].n), 12);
});

test('droits Exploitation : mêmes réponses que l’application', async () => {
  const { db } = await open();
  const menus = [...EXPLOITATION_MENU_PERMISSIONS.map(({ path: menu }) => menu), 'ccope', 'ccopeglob', 'statistiques', 'autre'];
  let seed = 7;
  const random = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let round = 0; round < 150; round += 1) {
    const permissions = {};
    menus.forEach((menu) => { if (random(3) === 0) permissions[menu] = ['read', 'write', 'none', 'bizarre', null][random(5)]; });
    const expected = normalizeExploitationPermissions(permissions);
    const { rows } = await db.query('select m, app_security.exploitation_level($1::jsonb, m) l from unnest($2::text[]) m', [JSON.stringify(permissions), Object.keys(expected)]);
    for (const { m, l } of rows) assert.equal(l, expected[m], `${m} avec ${JSON.stringify(permissions)}`);
  }
  assert.equal((await db.query("select app_security.exploitation_level(null, 'parametres') l")).rows[0].l, 'none');
});

test('sans connexion : aucune écriture sensible', async () => {
  const { no, db } = await open();
  await db.exec(insert('demandes_paiement_gain', demande()));
  for (const sql of [
    update('profils_exploitation', { auth_user_id: uid(99) }, 'id = 1'), update('profils_exploitation', { permissions: '{}' }, 'id = 1'), insert('profils_exploitation', { nom: 'X', auth_user_id: uid(99) }), 'delete from profils_exploitation',
    update('chefs_agence', { email: 'pirate@x.test' }, 'id = 101'), insert('validateurs_paiement_gain', { fonction: 'Directeur général', auth_user_id: uid(99) }), update('guichetieres', { auth_user_id: uid(99) }, 'true'),
    insert('demandes_paiement_gain', demande()), update('demandes_paiement_gain', AUTHORIZED, 'true'), 'delete from demandes_paiement_gain',
    update('app_settings', { value: '{}' }, 'true'), insert('app_settings', { key: 'x', value: '{}' }), 'delete from app_settings',
    insert('paiement_gain_workflow_config', { libelle: 'x' }), insert('paiement_gain_workflow_events', { codeDemande: 'x' }),
    update('salaire_config_historique', { type: 'x' }, 'true'), update('objectifs_salaire', { target_value: 1 }, 'true'), update('versements_guichetieres', { montant: 1 }, 'true'), insert('guichetiere_agence_history', { code_prepose: 'P1' }), insert('profil_utilisateur_templates', { nom: 'x' }),
  ]) await no('anon', sql, /sans connexion/);
});

test('jamais contrôlés : éditeur SQL et Edge Functions', async () => {
  const { db, ok } = await open();
  await db.exec(update('profils_exploitation', { statut: 'Actif', permissions: JSON.stringify(WRITE) }, 'id = 1'));
  await ok('service_role', update('app_settings', { value: '{"b":2}' }, "key = 'general'"));
  await ok('service_role', insert('validateurs_paiement_gain', { fonction: 'Directeur général', nom: 'x' }));
  // Autre compte de la base (ETL, reporting), connecté sans passer par l'API.
  await db.exec('create role etl; grant usage on schema public to etl; grant all on techniciens to etl; grant all on all sequences in schema public to etl');
  await db.exec(`set role etl; ${insert('techniciens', { nom: 'import' })}; reset role`);
  await assert.rejects(db.exec("set role etl; select app_security.set_mode('observe')"), /permission denied/);
});

test('profils Exploitation', async () => {
  const { ok, no } = await open();
  await ok('admin', insert('profils_exploitation', { nom: 'N', email: 'n@x.test', permissions: '{}' }));
  await ok('admin', update('profils_exploitation', { statut: 'Inactif' }, "email = 'n@x.test'"));
  await ok('admin', "delete from profils_exploitation where email = 'n@x.test'");
  await ok('admin', insert('profil_utilisateur_templates', { nom: 'Modèle' }));
  for (const who of ['lecteur', 'chef', 'guichetiere']) await no(who, insert('profil_utilisateur_templates', { nom: 'x' }));
  await ok('lecteur', update('profils_exploitation', { nom: 'Moi', prenom: 'M', telephone: '1', photo_url: 'u' }, 'id = 2'));
  await no('lecteur', update('profils_exploitation', { permissions: JSON.stringify(WRITE) }, 'id = 2'));
  await no('lecteur', update('profils_exploitation', { statut: 'Actif', email: 'z@x.test' }, 'id = 2'));
  await no('lecteur', update('profils_exploitation', { nom: 'Autre' }, 'id = 1'));
  for (const who of ['guichetiere', 'chef', 'inconnu', 'dr']) {
    await no(who, update('profils_exploitation', { auth_user_id: uid(ACCOUNTS[who][0]) }, 'id = 1'), /rattachement/);
    await no(who, insert('profils_exploitation', { nom: 'X', permissions: JSON.stringify(WRITE), auth_user_id: uid(ACCOUNTS[who][0]) }));
  }
});

test('profil désactivé ou mise en service', async () => {
  const { db, ok, no } = await open();
  await db.exec(update('profils_exploitation', { statut: 'Inactif' }, 'id = 1'));
  await no('admin', update('app_settings', { value: '{}' }, "key = 'general'"));
  // Base neuve : aucun profil lié → le premier compte connecté configure tout.
  await db.exec('update profils_exploitation set auth_user_id = null');
  await ok('inconnu', insert('profils_exploitation', { nom: 'Premier', permissions: JSON.stringify(WRITE), auth_user_id: uid(99) }));
  await no('chef', insert('profils_exploitation', { nom: 'Second' }));
  await no('anon', insert('profils_exploitation', { nom: 'Second' }));
});

test('fiches : gestion, propre fiche, première connexion, renommages', async () => {
  const { ok, no, one } = await open();
  // Gestion par l'Exploitation.
  await ok('admin', insert('chefs_agence', { nom: 'N', email: 'n@x.test', auth_user_id: uid(77) }));
  await ok('admin', update('chefs_agence', { is_current: false, auth_user_id: null }, "email = 'n@x.test'"));
  await ok('admin', insert('guichetieres', { nom: 'N' }));
  await ok('admin', "delete from guichetieres where nom = 'N'");
  await ok('admin', insert('techniciens', { nom: 'N' }));
  await ok('admin', insert('chefs_secteur', { nom: 'N' }));
  await ok('admin', insert('validateurs_paiement_gain', { nom: 'N', fonction: 'Directeur régional' }));
  for (const table of ['chefs_agence', 'guichetieres', 'techniciens', 'chefs_secteur', 'validateurs_paiement_gain']) {
    await no('lecteur', insert(table, { nom: 'X' }));
    await no('guichetiere', `delete from ${table}`);
  }
  // Sa propre fiche.
  for (const [who, table] of [['chef', 'chefs_agence'], ['guichetiere', 'guichetieres'], ['technicien', 'techniciens'], ['chefSecteur', 'chefs_secteur'], ['dr', 'validateurs_paiement_gain']]) {
    const mine = `auth_user_id = '${uid(ACCOUNTS[who][0])}'`;
    await ok(who, update(table, { nom: 'Moi', prenom: 'P', telephone: '2', ...(table === 'validateurs_paiement_gain' ? {} : { photo_url: 'u' }) }, mine));
    await no(who, update(table, { email: 'autre@x.test' }, mine));
    await no(who, update(table, { nom: 'Pirate' }, `auth_user_id is distinct from '${uid(ACCOUNTS[who][0])}'`));
  }
  await no('chef', update('chefs_agence', { agenceEnCharge: 'Limete', codePDV: '002' }, 'id = 101'));
  await no('guichetiere', update('guichetieres', { agenceAssigne: 'Limete' }, "matricule = 'G1'"));
  await no('dr', update('validateurs_paiement_gain', { fonction: 'Directeur général' }, 'id = 21'));
  await no('dr', update('validateurs_paiement_gain', { regionAssignee: 'Sud' }, 'id = 21'));
  // Première connexion : l'e-mail de la fiche est celui du compte.
  await ok('nouvelle', update('guichetieres', { auth_user_id: uid(32) }, "matricule = 'G2'"));
  await ok('nouvelle', update('guichetieres', { telephone: '3' }, "matricule = 'G2'"));
  await no('inconnu', update('guichetieres', { auth_user_id: uid(99) }, "matricule = 'G3'"), /rattachement/);
  await no('guichetiere', update('chefs_agence', { auth_user_id: uid(31) }, 'id = 103'), /rattachement/);
  await no('nouvelle', update('guichetieres', { auth_user_id: uid(99) }, "matricule = 'G2'"), /rattachement/);
  await ok('chefNonLie', update('chefs_agence', { telephone: '4' }, 'id = 103')); // compte pas encore rattaché
  // Renommage d'agence et de secteur (cascades de l'application).
  await ok('admin', update('guichetieres', { agenceAssigne: 'Gombe 2' }, `"agenceAssigne" = 'Gombe'`));
  assert.equal((await one(`select "agenceAssigne" a from guichetieres where matricule = 'G1'`)).a, 'Gombe 2');
});

test('renommages : le menu Agences ou Secteurs suffit, pour la seule colonne concernée', async () => {
  const { db, ok, no } = await open();
  await db.exec(update('profils_exploitation', { permissions: JSON.stringify({ ...READ, agences: 'write', secteurs: 'write' }) }, 'id = 2'));
  await ok('lecteur', update('chefs_agence', { agenceEnCharge: 'Gombe 2' }, `"agenceEnCharge" = 'Gombe'`));
  await ok('lecteur', update('guichetieres', { agenceAssigne: 'Gombe 2' }, `"agenceAssigne" = 'Gombe'`));
  await ok('lecteur', update('guichetiere_agence_history', { agence_assignee: 'Gombe 2' }, "agence_assignee = 'Gombe'"));
  await ok('lecteur', update('chefs_secteur', { secteurEnCharge: 'S1 bis' }, `"secteurEnCharge" = 'S1'`));
  await no('lecteur', update('chefs_agence', { agenceEnCharge: 'X', email: 'x@x.test' }, 'id = 101'));
  await no('lecteur', update('guichetieres', { matricule: 'X' }, "matricule = 'G1'"));
});

test('affectations, y compris par la fonction de la base', async () => {
  const { as, ok, no, one } = await open();
  await ok('admin', "select change_guichetiere_agence('P1', 'Limete')");
  assert.equal((await one(`select "agenceAssigne" a from guichetieres where matricule = 'G1'`)).a, 'Limete');
  for (const who of ['guichetiere', 'chef', 'lecteur', 'anon']) await assert.rejects(as(who, "select change_guichetiere_agence('P1', 'Matadi')"), /Action non autorisée/);
  assert.equal((await one(`select "agenceAssigne" a from guichetieres where matricule = 'G1'`)).a, 'Limete');
  await ok('admin', insert('guichetiere_agence_history', { code_prepose: 'P1', agence_assignee: 'Gombe' }));
  await no('chef', insert('guichetiere_agence_history', { code_prepose: 'P3', agence_assignee: 'Gombe' }));
});

test('réglages : chaque clé suit son menu', async () => {
  const { db, ok, no } = await open();
  await ok('admin', update('app_settings', { value: '{"a":2}' }, "key = 'general'"));
  await ok('admin', insert('app_settings', { key: 'theme_colors', value: '{}' }));
  for (const who of ['lecteur', 'chef', 'guichetiere', 'dr', 'technicien', 'inconnu']) {
    await no(who, update('app_settings', { value: '{"pirate":1}' }, "key = 'general'"));
    await no(who, update('app_settings', { value: '{}' }, "key = 'profils_espaces_utilisateurs'"));
    await no(who, insert('app_settings', { key: 'nouvelle', value: '{}' }));
  }
  const grant = (menu) => db.exec(update('profils_exploitation', { permissions: JSON.stringify({ ...READ, [menu]: 'write' }) }, 'id = 2'));
  for (const [menu, allowed, denied] of [
    ['parametres', ['general', 'salaire_guichetiere_config', 'custom_salary_formulas', 'app_language', 'resource_mode', 'activity_retention', 'theme_colors', 'mobile_customization', 'powerbi_ccope_url', 'prelevements_config'], ['functionalites_espaces', 'notification_settings', 'mobi_rentabilite:global']],
    ['profils-exploitation', ['functionalites_espaces', 'functionalites_espaces_onglets', 'profils_espaces_utilisateurs', 'profils_espaces_templates', 'client_branding', 'org_structure'], ['general', 'custom_salary_formulas']],
    ['notifications-exploitation', ['notification_settings', 'reminder_config'], ['general']],
    ['points-vente-mobi', ['mobi_rentabilite:global', 'mobi_rentabilite:T1'], ['general']],
    ['chiffres-daffaires', ['custom_salary_formulas'], ['salaire_guichetiere_config', 'general']],
  ]) {
    await grant(menu);
    for (const key of allowed) await ok('lecteur', insert('app_settings', { key, value: '{}' }), `${menu} → ${key}`);
    for (const key of denied) await no('lecteur', insert('app_settings', { key, value: '{}' }));
  }
  await no('admin', "delete from app_settings where key = 'general'", /suppression/);
  await no('admin', update('app_settings', { key: 'autre' }, "key = 'general'"), /clé/);
  await no('admin', insert('app_settings', { key: 'activity_purge_status', value: '{}' }), /écrit par la base/);
});

test('salaires : formules, objectifs, versements', async () => {
  const { ok, no } = await open();
  await ok('admin', insert('salaire_config_historique', { type: 'prime' }));
  await ok('admin', update('salaire_config_historique', { date_fin: '2026-11-26' }, 'true'));
  for (const who of ['lecteur', 'chef', 'guichetiere']) await no(who, insert('salaire_config_historique', { type: 'x' }));

  await ok('admin', update('objectifs_salaire', { target_value: 20 }, 'true'));
  await ok('chef', insert('objectifs_salaire', { level: 'agence', target_key: 'Gombe', target_value: 5 }));
  await ok('chef', update('objectifs_salaire', { target_value: 6 }, "target_key = 'Gombe'"));
  await ok('chef', "delete from objectifs_salaire where target_key = 'Gombe'");
  await no('chef', update('objectifs_salaire', { target_value: 6 }, "target_key = 'Limete'"));
  await no('chef', insert('objectifs_salaire', { level: 'region', target_key: 'Nord', target_value: 5 }));
  await no('chef', update('objectifs_salaire', { target_distribution: '{}' }, "level = 'national'"));
  await ok('dr', update('objectifs_salaire', { target_value: 7 }, "target_key = 'Nord'"));
  await no('drSud', update('objectifs_salaire', { target_value: 8 }, "target_key = 'Nord'"));
  await no('dr', update('objectifs_salaire', { target_key: 'Sud' }, "target_key = 'Nord'"));
  await no('guichetiere', update('objectifs_salaire', { target_value: 9 }, 'true'));

  await ok('admin', insert('versements_guichetieres', { guichetiere_code: 'P3', date_versement: '2026-11-02', montant: 5 }));
  await ok('chef', insert('versements_guichetieres', { guichetiere_code: 'P1', date_versement: '2026-11-02', montant: 5 }));
  await ok('chef', insert('versements_guichetieres', { guichetiere_code: 'P2', date_versement: '2026-11-02', montant: 5 }), 'ancienne guichetière de l’agence');
  await ok('chef', "delete from versements_guichetieres where guichetiere_code = 'P1'");
  await no('chef', insert('versements_guichetieres', { guichetiere_code: 'P3', date_versement: '2026-11-02', montant: 5 }));
  await no('chef', update('versements_guichetieres', { guichetiere_code: 'P1' }, "guichetiere_code = 'P3'"));
  await ok('dr', insert('versements_guichetieres', { guichetiere_code: 'P2', date_versement: '2026-11-03', montant: 5 }));
  await no('dr', insert('versements_guichetieres', { guichetiere_code: 'P3', date_versement: '2026-11-03', montant: 5 }));
  for (const who of ['guichetiere', 'technicien', 'lecteur']) await no(who, insert('versements_guichetieres', { guichetiere_code: 'P1', date_versement: '2026-11-04', montant: 5 }));
});

test('circuit de paiement : uniquement les rôles prévus, dans l’ordre', async () => {
  const { ok, no, one } = await open();
  await ok('chef', insert('demandes_paiement_gain', demande()));
  const d = 'id = 1';
  const state = async () => (await one(`select "statutGlobal" s from demandes_paiement_gain where ${d}`)).s;
  const others = (allowed) => Object.keys(ACCOUNTS).filter((who) => !allowed.includes(who));
  const approveChef = { ...REGIONAL, dateValidationChef: '2026-11-26', commentaireDerniereAction: 'ok' };
  const approveDr = { ...GENERAL, dateValidationDirecteurRegional: '2026-11-26', commentaireDerniereAction: 'ok' };
  const approveDg = { ...EXPLOITATION, dateValidationDirecteurGeneral: '2026-11-26', commentaireDerniereAction: 'ok' };
  const pay = { ...PAID, commentaireDerniereAction: 'payé' };

  // Étape chef (la demande attend sa validation, quel que soit le niveau enregistré).
  for (const who of others(['chef'])) await no(who, update('demandes_paiement_gain', approveChef, d));
  await no('dr', update('demandes_paiement_gain', approveDr, d));
  await no('chef', update('demandes_paiement_gain', { ...EXPLOITATION, dateValidationChef: '2026-11-26' }, d), /circuit/);
  await no('chef', update('demandes_paiement_gain', { ...approveChef, montantGain: 99 }, d), /circuit/);
  await ok('chef', update('demandes_paiement_gain', approveChef, d));
  // Étape directeur régional.
  for (const who of others(['dr'])) await no(who, update('demandes_paiement_gain', approveDr, d));
  await no('dr', update('demandes_paiement_gain', { ...EXPLOITATION, dateValidationDirecteurRegional: '2026-11-26' }, d), /circuit/);
  await no('dr', update('demandes_paiement_gain', { ...approveDr, directeurGeneralId: 24 }, d));
  await ok('dr', update('demandes_paiement_gain', approveDr, d));
  // Étape directeur général.
  for (const who of others(['dg'])) await no(who, update('demandes_paiement_gain', approveDg, d));
  for (const change of [AUTHORIZED, pay, { ...approveDg, montantGain: 1 }, { ...EXPLOITATION, dateValidationDirecteurGeneral: null }]) await no('dg', update('demandes_paiement_gain', change, d), /circuit/);
  await ok('dg', update('demandes_paiement_gain', approveDg, d));
  // Étape Exploitation.
  for (const who of others(['admin', 'autorise'])) await no(who, update('demandes_paiement_gain', AUTHORIZED, d));
  await no('autorise', update('demandes_paiement_gain', pay, d));
  await no('autorise', update('demandes_paiement_gain', { ...AUTHORIZED, agencePaiementNom: '' }, d));
  await ok('autorise', update('demandes_paiement_gain', AUTHORIZED, d));
  // Paiement : l'agence désignée (Limete), pas l'agence d'origine.
  for (const who of others(['chefPayeur'])) await no(who, update('demandes_paiement_gain', pay, d));
  await no('chefPayeur', update('demandes_paiement_gain', { ...pay, nomGagnant: 'Complice' }, d));
  await ok('chefPayeur', update('demandes_paiement_gain', pay, d));
  assert.equal(await state(), 'Payée');
  for (const who of Object.keys(ACCOUNTS)) await no(who, update('demandes_paiement_gain', AUTHORIZED, d), /terminée/);
  for (const who of ['admin', 'chef']) await no(who, `delete from demandes_paiement_gain where ${d}`);
});

test('circuit de paiement : refus, petits montants, directeur par région, agence sans code', async () => {
  const { db, ok, no, one } = await open();
  const petit = demande({ montantGain: 200000, circuitValidation: 'Exploitation > Paiement en agence', ...EXPLOITATION, directeurRegionalId: null, directeurGeneralId: null });
  await ok('chef', insert('demandes_paiement_gain', petit));
  await ok('admin', update('demandes_paiement_gain', { ...AUTHORIZED, agencePaiementNom: 'GOMBE ', agencePaiementCodePDV: null }, 'id = 1'));
  await no('chefPayeur', update('demandes_paiement_gain', PAID, 'id = 1'));
  await ok('chef', update('demandes_paiement_gain', PAID, 'id = 1')); // par le nom, sans code enregistré
  await ok('chef', insert('demandes_paiement_gain', demande({ codeDemande: 'B' })));
  await no('dr', update('demandes_paiement_gain', REJECTED, 'id = 2'));
  await ok('chef', update('demandes_paiement_gain', REJECTED, 'id = 2'));
  await ok('chef', insert('demandes_paiement_gain', demande({ codeDemande: 'C', directeurRegionalId: 999, directeurRegionalRegion: 'NORD' })));
  await ok('chef', update('demandes_paiement_gain', { ...REGIONAL, dateValidationChef: '2026-11-26' }, 'id = 3'));
  await no('drSud', update('demandes_paiement_gain', REJECTED, 'id = 3'));
  await ok('dr', update('demandes_paiement_gain', REJECTED, 'id = 3'));
  // Chef dont la fiche a changé de ligne (historique) : ses demandes restent les siennes.
  await db.exec(insert('demandes_paiement_gain', demande({ codeDemande: 'D', chefAgenceId: 100, chefAgenceMatricule: null })));
  await ok('chef', update('demandes_paiement_gain', REJECTED, `"codeDemande" = 'D'`));
  // Directeur désactivé.
  await db.exec(insert('demandes_paiement_gain', demande({ codeDemande: 'E', dateValidationChef: '2026-11-26' })));
  await db.exec(update('validateurs_paiement_gain', { statut: 'Inactif' }, 'id = 21'));
  await no('dr', update('demandes_paiement_gain', REJECTED, `"codeDemande" = 'E'`));
  assert.equal((await one("select count(*)::int n from demandes_paiement_gain")).n, 5);
});

test('création de demande : pas d’usurpation ni d’étape sautée', async () => {
  const { db, ok, no } = await open();
  for (const who of ['guichetiere', 'dr', 'admin', 'technicien', 'inconnu']) await no(who, insert('demandes_paiement_gain', demande()), /réservée à un chef/);
  await no('chefInactif', insert('demandes_paiement_gain', demande({ chefAgenceId: 104, chefAgenceMatricule: 'C4' })), /réservée/);
  await no('chef', insert('demandes_paiement_gain', demande({ chefAgenceId: 102, chefAgenceMatricule: 'C2' })), /autre chef/);
  await no('chef', insert('demandes_paiement_gain', demande({ chefAgenceId: null, chefAgenceMatricule: null })), /autre chef/);
  await no('chef', insert('demandes_paiement_gain', demande(AUTHORIZED)), /déjà validée/);
  await no('chef', insert('demandes_paiement_gain', demande({ dateValidationChef: '2026-11-26' })), /déjà validée/);
  await no('chef', insert('demandes_paiement_gain', demande(EXPLOITATION)), /sautée/);
  await no('chef', insert('demandes_paiement_gain', demande(GENERAL)), /sautée/);
  await no('chef', insert('demandes_paiement_gain', demande({ ...REGIONAL, statutGlobal: 'Payée' })), /incohérente/);
  for (const statutGlobal of ['Payée', 'Autorisée pour paiement', 'En attente exploitation']) await no('chef', insert('demandes_paiement_gain', demande({ niveauValidationCourant: 'chef_agence', statutGlobal })), /incohérente/);
  for (const niveauValidationCourant of ['terminee', 'agence_paiement', 'inconnu']) await no('chef', insert('demandes_paiement_gain', demande({ niveauValidationCourant })), /incohérente/);
  await ok('chef', insert('demandes_paiement_gain', demande({ niveauValidationCourant: 'chef_agence', statutGlobal: 'En attente chef d’agence' })));
  await no('chef', insert('demandes_paiement_gain', demande({ circuitValidation: 'Exploitation' })), /incomplet/);
  await ok('chefNonLie', insert('demandes_paiement_gain', demande({ chefAgenceId: 103, chefAgenceMatricule: 'C3' })));
  await ok('chef', insert('demandes_paiement_gain', demande({ montantGain: 99999, circuitValidation: 'Exploitation > Paiement en agence', ...EXPLOITATION })));
  // Tranches configurées par le client.
  await db.exec(`insert into paiement_gain_workflow_config (ordre, libelle, "montantMin", "montantMax", "requiresRegionalApproval") values (1, 'A', 0, 1000, false), (2, 'B', 1000, 5000, true)`);
  const regional = { circuitValidation: 'Directeur régional > Exploitation', ...REGIONAL };
  await ok('chef', insert('demandes_paiement_gain', demande({ montantGain: 500, circuitValidation: 'Exploitation', ...EXPLOITATION })));
  await no('chef', insert('demandes_paiement_gain', demande({ montantGain: 1000, circuitValidation: 'Exploitation', ...EXPLOITATION })), /incomplet/);
  await ok('chef', insert('demandes_paiement_gain', demande({ montantGain: 1000, ...regional })));
  await ok('chef', insert('demandes_paiement_gain', demande({ montantGain: 5000, ...regional })), 'borne supérieure exacte');
  await no('chef', insert('demandes_paiement_gain', demande({ montantGain: 9000, ...regional })), /aucune procédure/);
  await ok('chef', insert('demandes_paiement_gain', demande({ montantGain: 500, ...regional })), 'circuit plus strict que nécessaire');
});

test('photo de la pièce envoyée après coup (hors-ligne)', async () => {
  const { ok, no } = await open();
  await ok('chef', insert('demandes_paiement_gain', demande()));
  await no('chefPayeur', update('demandes_paiement_gain', { photoPieceUrl: 'u' }, 'id = 1'));
  await ok('chef', update('demandes_paiement_gain', { photoPieceUrl: 'u' }, 'id = 1'));
  await no('chef', update('demandes_paiement_gain', { photoPieceUrl: 'autre' }, 'id = 1'));
});

test('circuit configuré et journal de paiement', async () => {
  const { ok, no } = await open();
  await ok('autorise', insert('paiement_gain_workflow_config', { libelle: 'x' }));
  for (const who of ['lecteur', 'chef', 'dr']) await no(who, insert('paiement_gain_workflow_config', { libelle: 'x' }));
  for (const who of ['chef', 'dr', 'dg', 'autorise', 'admin']) await ok(who, insert('paiement_gain_workflow_events', { codeDemande: 'x', actionType: 'a' }));
  for (const who of ['guichetiere', 'technicien', 'inconnu']) await no(who, insert('paiement_gain_workflow_events', { codeDemande: 'x', actionType: 'a' }));
  for (const who of ['admin', 'chef']) { await no(who, update('paiement_gain_workflow_events', { actionType: 'z' }, 'true')); await no(who, 'delete from paiement_gain_workflow_events'); }
});

test('mode observation : rien n’est bloqué, chaque refus est compté une fois par type', async () => {
  const { db, as, one } = await open('observe');
  await as('anon', update('app_settings', { value: '{"x":1}' }, "key = 'general'"));
  await as('anon', update('app_settings', { value: '{"x":2}' }, "key = 'general'"));
  await as('guichetiere', update('profils_exploitation', { auth_user_id: uid(31) }, 'id = 3'));
  await as('chef', update('objectifs_salaire', { target_value: 1 }, "target_key = 'Gombe'")); // légitime : pas noté
  assert.equal((await one(`select value->>'x' x from app_settings where key = 'general'`)).x, '2');
  const { rows } = await db.query('select table_nom, appelant, raison, colonnes, nombre::int from app_security.refus order by table_nom');
  assert.deepEqual(rows, [
    { table_nom: 'app_settings', appelant: 'anon', raison: 'sans connexion', colonnes: 'value', nombre: 2 },
    { table_nom: 'profils_exploitation', appelant: 'authenticated', raison: 'rattachement de compte non autorisé', colonnes: 'auth_user_id', nombre: 1 },
  ]);
});

test('erreur interne de la garde : notée sans bloquer en observation, refusée en blocage', async () => {
  const { db, as, no } = await open('observe');
  await db.exec('drop table agences cascade');
  await as('dr', insert('versements_guichetieres', { guichetiere_code: 'P1', date_versement: '2026-11-04', montant: 5 }));
  assert.match((await db.query('select raison from app_security.refus')).rows[0].raison, /erreur interne/);
  await db.exec("select app_security.set_mode('enforce')");
  await no('dr', insert('versements_guichetieres', { guichetiere_code: 'P1', date_versement: '2026-11-04', montant: 5 }), /erreur interne/);
});

test('l’application ne peut ni changer le mode ni lire les refus', async () => {
  const { as } = await open();
  for (const who of ['anon', 'admin', 'service_role']) {
    await assert.rejects(as(who, "select app_security.set_mode('observe')"), /permission denied/);
  }
  for (const who of ['anon', 'admin']) {
    await assert.rejects(as(who, 'select * from app_security.refus'), /permission denied/);
    await assert.rejects(as(who, "update app_security.config set mode = 'observe'"), /permission denied/);
  }
});

test('lectures inchangées et imports volumineux', async () => {
  const { as, one } = await open();
  assert.equal((await as('anon', 'select id from profils_exploitation')).rows.length, 3);
  const start = Date.now();
  await as('admin', "insert into guichetieres (nom, matricule) select 'n' || g, 'm' || g from generate_series(1, 2000) g");
  const elapsed = Date.now() - start;
  assert.equal((await one("select count(*)::int n from guichetieres where matricule like 'm%'")).n, 2000);
  assert.ok(elapsed < 5000, `import de 2 000 lignes : ${elapsed} ms`);
  console.log(`import de 2 000 fiches : ${elapsed} ms`);
});
