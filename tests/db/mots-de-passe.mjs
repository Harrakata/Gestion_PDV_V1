// Effacement des mots de passe en clair, sur une base PostgreSQL en mémoire (aucune base réelle).
//   npm install --no-save @electric-sql/pglite && node --test tests/db/mots-de-passe.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modulePath = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = await import(modulePath);
const { pgcrypto } = await import(process.env.PGLITE_MODULE ? process.env.PGLITE_MODULE.replace(/index\.js$/, 'contrib/pgcrypto.js') : '@electric-sql/pglite/contrib/pgcrypto');

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const MIGRATION = read('supabase/migrations/202611271200_mots_de_passe_en_clair.sql');
const DOC = [...read('docs/MOTS-DE-PASSE.md').replace(/\r\n/g, '\n').matchAll(/```sql\n([\s\S]*?)```/g)].map(([, sql]) => sql);

const SCHEMA = `
  create role anon; create role authenticated;
  create schema extensions; create extension pgcrypto schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key, email text, encrypted_password text);
  create table guichetieres (id serial primary key, matricule text, nom text, email text, "mdpPrepose" text, auth_user_id uuid);
  create table chefs_agence (id serial primary key, matricule text, nom text, prenom text, email text, telephone text, mdp varchar(50) not null default 'changeme', auth_user_id uuid, is_current boolean not null default true, valid_to timestamptz);
  create table chefs_secteur (id serial primary key, matricule text, nom text, email text, mdp text, auth_user_id uuid);
  create table techniciens (id serial primary key, matricule text, nom text, email text, "motDePasse" text not null, auth_user_id uuid);
  create table profils_exploitation (id serial primary key, nom text, email text, auth_user_id uuid);
  create table validateurs_paiement_gain (id serial primary key, nom text, prenom text, email text, fonction text, auth_user_id uuid, motdepasse text, mot_de_passe text);
  create table parametres_externes (id serial primary key, "motDePasse" text);
  insert into auth.users values
    ('00000000-0000-4000-8000-000000000001', 'G1@x.test', extensions.crypt('secret-g1', extensions.gen_salt('bf', 4))),
    ('00000000-0000-4000-8000-000000000002', 'c1@x.test', extensions.crypt('changé-depuis', extensions.gen_salt('bf', 4))),
    ('00000000-0000-4000-8000-000000000003', 't1@x.test', extensions.crypt('secret-t1', extensions.gen_salt('bf', 4))),
    ('00000000-0000-4000-8000-000000000004', 's1@x.test', extensions.crypt('secret-s1', extensions.gen_salt('bf', 4)));
  insert into guichetieres (matricule, nom, email, "mdpPrepose", auth_user_id) values
    ('G1', 'Une', ' g1@x.test ', 'secret-g1', null), ('G2', 'Deux', null, '', null), ('G3', 'Trois', null, null, null);
  insert into chefs_agence (matricule, nom, email, mdp, auth_user_id) values ('C1', 'Chef', 'c1@x.test', 'secret-c1', '00000000-0000-4000-8000-000000000002');
  insert into chefs_secteur (matricule, nom, email, mdp, auth_user_id) values ('S1', 'Secteur', null, 'secret-s1', '00000000-0000-4000-8000-000000000004');
  insert into techniciens (matricule, nom, email, "motDePasse", auth_user_id) values ('T1', 'Tech', 'autre@x.test', 'secret-t1', '00000000-0000-4000-8000-000000000003');
  insert into validateurs_paiement_gain (nom, motdepasse, mot_de_passe) values ('DG', 'a', 'b');
  insert into parametres_externes ("motDePasse") values ('à garder');
`;
const database = async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SCHEMA);
  return db;
};
const rows = async (db, sql) => (await db.query(sql)).rows;
const everything = async (db) => JSON.stringify([
  await rows(db, 'select * from guichetieres order by id'), await rows(db, 'select * from chefs_agence order by id'), await rows(db, 'select * from chefs_secteur order by id'),
  await rows(db, 'select * from techniciens order by id'), await rows(db, 'select * from validateurs_paiement_gain order by id'),
]);

test('état des lieux : compte les valeurs, ne modifie rien', async () => {
  const db = await database();
  const before = await everything(db);
  await assert.rejects(db.exec(DOC[0]), (error) => {
    assert.match(error.message, /ÉTAT DES LIEUX/);
    for (const line of ['guichetieres.mdpPrepose : 1', 'chefs_agence.mdp : 1', 'techniciens.motDePasse : 1', 'chefs_secteur.mdp : 1']) assert.ok(error.message.includes(line), error.message);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
  assert.equal(await everything(db), before);
});

test('qui doit changer : seulement les comptes dont le mot de passe est toujours celui de la fiche', async () => {
  const db = await database();
  const found = [];
  for (const sql of DOC.slice(1, 5)) found.push(...await rows(db, sql));
  assert.deepEqual(found.map(({ matricule }) => matricule).sort(), ['G1', 'S1', 'T1']);
});

test('effacement : toutes les variantes, rien d’autre', async () => {
  const db = await database();
  const users = await rows(db, 'select * from auth.users order by id');
  const results = await db.exec(MIGRATION);
  assert.match(results.at(-1).rows[0].resultat, /chefs_agence\.mdp.*guichetieres\.mdpPrepose.*techniciens\.motDePasse/);
  assert.doesNotMatch(await everything(db), /secret|"(motdepasse|mot_de_passe)":"/);
  assert.deepEqual(await rows(db, 'select matricule, nom, email, "mdpPrepose" from guichetieres order by id'), [
    { matricule: 'G1', nom: 'Une', email: ' g1@x.test ', mdpPrepose: null }, { matricule: 'G2', nom: 'Deux', email: null, mdpPrepose: null }, { matricule: 'G3', nom: 'Trois', email: null, mdpPrepose: null },
  ]);
  assert.deepEqual(await rows(db, 'select * from auth.users order by id'), users);
  assert.deepEqual(await rows(db, 'select "motDePasse" from parametres_externes'), [{ motDePasse: 'à garder' }]);
});

test('ensuite : un appareil pas encore à jour enregistre sa fiche, sans le mot de passe', async () => {
  const db = await database();
  await db.exec(MIGRATION);
  await db.exec(`
    insert into guichetieres (matricule, nom, "mdpPrepose") values ('G9', 'Neuf', 'secret-g9');
    update chefs_agence set nom = 'Renommé', mdp = 'secret-c2';
    insert into techniciens (matricule, nom) values ('T8', 'Sans mot de passe');
    insert into techniciens (matricule, nom, "motDePasse") values ('T9', 'Avec', 'secret-t9');
    insert into chefs_agence (matricule, nom) values ('C9', 'Sans valeur par défaut');
    insert into validateurs_paiement_gain (nom, motdepasse, mot_de_passe) values ('DR', 'x', 'y');
  `);
  assert.doesNotMatch(await everything(db), /secret|changeme|"(motdepasse|mot_de_passe)":"/);
  assert.equal((await rows(db, "select nom from guichetieres where matricule = 'G9'"))[0].nom, 'Neuf');
  assert.deepEqual((await rows(db, 'select distinct nom from chefs_agence order by nom')).map(({ nom }) => nom), ['Renommé', 'Sans valeur par défaut']);
});

test('rejouable, et sans effet sur une base sans ces colonnes', async () => {
  const db = await database();
  await db.exec(MIGRATION);
  const before = await everything(db);
  await db.exec(MIGRATION);
  assert.equal(await everything(db), before);

  const empty = new PGlite();
  await empty.exec('create table guichetieres (id int, nom text)');
  assert.match((await empty.exec(MIGRATION)).at(-1).rows[0].resultat, /aucune colonne concernée/);
});

test('directeurs : fiches détachées rattachées au compte du même e-mail, sans ambiguïté', async () => {
  const db = await database();
  await db.exec(`
    delete from validateurs_paiement_gain;
    insert into validateurs_paiement_gain (nom, fonction, email, auth_user_id) values
      ('Détaché', 'Directeur régional', ' G1@X.test ', null), ('Lié', 'Directeur général', 'c1@x.test', '00000000-0000-4000-8000-000000000002'),
      ('Homonyme', 'Directeur général', 'c1@x.test', null), ('Sans compte', 'Directeur régional', 'personne@x.test', null),
      ('Double A', 'Directeur régional', 't1@x.test', null), ('Double B', 'Directeur régional', 't1@x.test', null), ('Sans e-mail', 'Directeur régional', null, null);
  `);
  assert.deepEqual((await rows(db, DOC[5])).map(({ nom }) => nom), ['Détaché']);
  assert.deepEqual((await rows(db, 'select nom from validateurs_paiement_gain where auth_user_id is not null order by nom')).map(({ nom }) => nom), ['Détaché', 'Lié']);
  assert.deepEqual(await rows(db, DOC[5]), []);
});

test('chefs d’agence réaffectés : e-mail, téléphone et compte repris de la fiche précédente', async () => {
  const db = await database();
  await db.exec(`
    delete from chefs_agence;
    insert into chefs_agence (matricule, nom, email, telephone, auth_user_id, is_current, valid_to) values
      ('A', 'Perdu', 'vieux@x.test', '1', null, false, '2025-01-01'), ('A', 'Perdu', 'g1@x.test', '2', '00000000-0000-4000-8000-000000000001', false, '2026-01-01'), (' A ', ' PERDU ', null, '', null, true, null),
      ('B', 'Autre personne', 'b@x.test', '3', null, false, '2026-01-01'), ('B', 'Remplaçant', null, null, null, true, null),
      ('C', 'Déjà bon', 'ancien@x.test', '4', null, false, '2026-01-01'), ('C', 'Déjà bon', 'bon@x.test', '5', null, true, null),
      ('D', 'Compte repris', 'c1@x.test', '6', '00000000-0000-4000-8000-000000000002', false, '2026-01-01'), ('D', 'Compte repris', null, null, null, true, null),
      ('E', 'Titulaire', 'titulaire@x.test', '7', '00000000-0000-4000-8000-000000000002', true, null);
  `);
  const before = await rows(db, 'select * from chefs_agence where not is_current order by id');
  assert.deepEqual((await rows(db, DOC[6])).map(({ matricule }) => matricule.trim()), ['A']);
  assert.deepEqual(await rows(db, "select email, telephone, auth_user_id from chefs_agence where is_current and btrim(matricule) = 'A'"), [{ email: 'g1@x.test', telephone: '2', auth_user_id: '00000000-0000-4000-8000-000000000001' }]);
  assert.deepEqual(await rows(db, 'select * from chefs_agence where not is_current order by id'), before);
  assert.deepEqual(await rows(db, DOC[6]), []);
});

test('fonctions internes : inaccessibles depuis l’application', async () => {
  const db = await database();
  await db.exec(MIGRATION);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from public.colonnes_mot_de_passe()'), /permission denied/);
    await db.exec('reset role');
  }
});
