# Mots de passe : comptes d'accès et effacement des valeurs en clair

## Où est le mot de passe

La connexion passe par Supabase Auth, qui garde les mots de passe chiffrés (`auth.users`). Les colonnes `mdp`, `mdpPrepose` et `motDePasse` des fiches ne servent à rien : d'anciens imports CSV y écrivaient le mot de passe, lisible. Elles ne sont plus ni lues ni écrites par l'application.

- **Créer ou changer un mot de passe** : depuis la fiche de la personne (Exploitation). L'application passe toujours par `src/features/comptes/accountsRepository.js`, qui appelle la fonction serveur `admin-manage-user`.
- **Import CSV** : crée ou met à jour les fiches, sans compte. Une colonne de mots de passe est ignorée, et l'import le signale. Le compte se crée ensuite en saisissant un mot de passe dans la fiche.

## Qui peut gérer un compte

Règles dans `supabase/functions/_shared/accountManager.js`, testées par `tests/unit/accountManager.test.js` :

| Action | Condition |
|---|---|
| Toute action | Profil Exploitation actif, en **écriture** sur le menu de **chaque** fiche liée au compte. Compte Exploitation : Profil et Fonctionnalité |
| Créer | E-mail libre. Compte déjà lié à une fiche du même type : refus. Personne ayant un autre rôle : le compte est réutilisé, **sans changer son mot de passe**, si l'appelant gère aussi cet autre rôle |
| Changer l'e-mail | En plus : l'e-mail ne doit pas être celui d'une fiche que l'appelant ne gère pas |
| Supprimer | Jamais son propre compte. Compte utilisé par une autre fiche : il est conservé |

## Effacer les mots de passe en clair

Dans cet ordre :

1. **Publier l'application** de cette version.
2. **Déployer la fonction** : `npx supabase functions deploy admin-manage-user --project-ref <ref>`.
3. **État des lieux** (éditeur SQL, lecture seule). Combien de valeurs sont enregistrées :
   ```sql
   do $$
   declare t record; n bigint; total text := '';
   begin
     for t in select table_name, column_name from information_schema.columns
       where table_schema = 'public' and lower(column_name) in ('mdp', 'mdpprepose', 'motdepasse', 'mot_de_passe') loop
       execute format('select count(*) from public.%I where nullif(btrim(%I::text), '''') is not null', t.table_name, t.column_name) into n;
       total := total || format(E'\n%s.%s : %s', t.table_name, t.column_name, n);
     end loop;
     raise exception 'ÉTAT DES LIEUX (rien n''est modifié) :%', coalesce(nullif(total, ''), ' aucune colonne');
   end $$;
   ```
   Un message rouge est attendu : c'est le résultat.
4. **Qui doit changer de mot de passe** : comptes dont le mot de passe actuel est celui écrit dans la fiche. À faire avant l'effacement, la comparaison n'étant plus possible ensuite. Une requête par table ; retirer celles dont le compte est à 0 à l'étape 3.
   ```sql
   select 'guichetière' as role, f.matricule, u.email from public.guichetieres f
   join auth.users u on u.id::text = f.auth_user_id::text or lower(u.email) = lower(btrim(f.email))
   where f."mdpPrepose" <> '' and u.encrypted_password = extensions.crypt(f."mdpPrepose", u.encrypted_password);
   ```
   ```sql
   select 'chef d''agence' as role, f.matricule, u.email from public.chefs_agence f
   join auth.users u on u.id::text = f.auth_user_id::text or lower(u.email) = lower(btrim(f.email))
   where f.mdp <> '' and u.encrypted_password = extensions.crypt(f.mdp, u.encrypted_password);
   ```
   ```sql
   select 'chef de secteur' as role, f.matricule, u.email from public.chefs_secteur f
   join auth.users u on u.id::text = f.auth_user_id::text or lower(u.email) = lower(btrim(f.email))
   where f.mdp <> '' and u.encrypted_password = extensions.crypt(f.mdp, u.encrypted_password);
   ```
   ```sql
   select 'technicien' as role, f.matricule, u.email from public.techniciens f
   join auth.users u on u.id::text = f.auth_user_id::text or lower(u.email) = lower(btrim(f.email))
   where f."motDePasse" <> '' and u.encrypted_password = extensions.crypt(f."motDePasse", u.encrypted_password);
   ```
   La comparaison est volontairement lente (environ 0,1 s par compte). Si la requête expire, procéder par tranches : ajouter `and f.matricule like '1%'`, puis `'2%'`, etc.
5. **Effacer** : exécuter `supabase/migrations/202611271200_mots_de_passe_en_clair.sql`. **Définitif.** Un déclencheur vide ensuite ces colonnes à chaque enregistrement.
6. **Faire changer** le mot de passe des personnes listées à l'étape 4.

## Directeurs qui ne peuvent plus se connecter

De juin à novembre 2026, modifier la fiche d'un directeur détachait son compte, et la connexion exige ce lien (« Votre compte n'est pas lié à un profil… »). Après publication de cette version, rattacher les fiches au compte du même e-mail (la requête affiche les fiches réparées ; aucune : rien à réparer) :

```sql
update public.validateurs_paiement_gain v set auth_user_id = u.id
from auth.users u
where v.auth_user_id is null and lower(btrim(v.email)) = lower(u.email)
  and not exists (select 1 from public.validateurs_paiement_gain x where x.auth_user_id = u.id and x.fonction = v.fonction)
  and (select count(*) from public.validateurs_paiement_gain y where y.fonction = v.fonction and lower(btrim(y.email)) = lower(u.email)) = 1
returning v.fonction, v.nom, v.prenom;
```

Les autres rôles se rattachent d'eux-mêmes à la connexion.

## Chefs d'agence réaffectés avant cette version

Changer l'affectation d'un chef d'agence (historique de sa fiche) lui faisait perdre son e-mail, son téléphone et son compte. Cette requête les reprend de sa fiche précédente (même matricule et même nom) et affiche les fiches réparées :

```sql
with precedente as (
  select distinct on (btrim(matricule)) btrim(matricule) as matricule, nom, email, telephone, auth_user_id
  from public.chefs_agence
  where not is_current and nullif(btrim(email), '') is not null
  order by btrim(matricule), valid_to desc nulls last
)
update public.chefs_agence c set
  email = p.email,
  telephone = coalesce(nullif(btrim(c.telephone), ''), p.telephone),
  auth_user_id = coalesce(c.auth_user_id, p.auth_user_id)
from precedente p
where c.is_current and btrim(c.matricule) = p.matricule and lower(btrim(c.nom)) = lower(btrim(p.nom))
  and nullif(btrim(c.email), '') is null
  and not exists (select 1 from public.chefs_agence x where x.is_current and x.id <> c.id
    and (lower(btrim(x.email)) = lower(btrim(p.email)) or x.auth_user_id = p.auth_user_id))
returning c.matricule, c.nom, c.prenom, c.email;
```

Les chefs de secteur réaffectés n'ont rien à réparer : leur connexion ne lit plus que la fiche en cours.

## Copies à supprimer

Les sauvegardes Supabase antérieures et les fichiers CSV importés contiennent encore ces mots de passe : supprimer les fichiers CSV.
