# Sécurité de la base — lot A

Contrôle de qui peut **modifier** les données sensibles, même en contournant l'application. Migration : `supabase/migrations/202611261200_securite_lot_a.sql`. Retour arrière : `scripts/securite/lot-a-retour-arriere.sql`.

## Comment ça marche

Un déclencheur (`aa_app_security`) contrôle chaque ajout, modification et suppression venant de l'application. Une action refusée renvoie une erreur `42501`, affichée « Vous n'avez pas les droits nécessaires pour cette action ». Les lectures et les règles RLS existantes ne changent pas. L'éditeur SQL, pg_cron et les Edge Functions ne sont pas contrôlés.

| Données | Qui peut modifier |
|---|---|
| `profils_exploitation`, `profil_utilisateur_templates` | Exploitation en écriture sur Profil et Fonctionnalité. Chacun : ses nom, prénom, téléphone, photo |
| `chefs_agence`, `guichetieres`, `chefs_secteur`, `techniciens`, `validateurs_paiement_gain` | Exploitation en écriture sur le menu correspondant. Chacun : ses coordonnées. Rattachement d'un compte : première connexion, si l'e-mail est le même |
| `guichetiere_agence_history` | Exploitation (Guichetières), ou renommage depuis Agences |
| `demandes_paiement_gain` | Création par un chef d'agence, pour lui-même. Puis chaque étape par son seul responsable : chef, directeur régional concerné, directeur général désigné, Exploitation (Autorisation Paiement Gain), chef de l'agence de paiement. Montant, bénéficiaire et circuit ne changent plus. Aucune suppression |
| `paiement_gain_workflow_config` | Exploitation (Autorisation Paiement Gain) |
| `paiement_gain_workflow_events` | Ajout seulement, par une personne du circuit |
| `app_settings` | Exploitation, selon la clé : Paramètres, Profil et Fonctionnalité, Notifications, Point de Vente Mobi, État comptable (formules personnalisées). Aucune suppression |
| `salaire_config_historique` | Exploitation (Paramètres) |
| `objectifs_salaire` | Exploitation (État comptable), chef pour son agence, directeur régional pour sa région |
| `versements_guichetieres` | Exploitation (État comptable), chef et directeur régional pour leurs guichetières |

## Mettre en service

1. **Installer** : exécuter la migration dans l'éditeur SQL. Elle vérifie d'abord la structure ; s'il manque une colonne, elle s'arrête sans rien changer. Résultat attendu : `Lot A installé, mode observe`.
2. **Publier l'application** de la même version.
3. **Observer** plusieurs jours, en faisant passer chaque rôle par ses actions : création et validation complète d'une demande de paiement, modification d'une fiche, d'un réglage, d'un objectif, d'un versement, renommage d'une agence, première connexion d'une guichetière.
   ```sql
   select * from app_security.refus order by dernier desc;
   ```
   En observation, **rien n'est bloqué**. Chaque ligne est une action qui aurait été refusée : légitime (règle à corriger) ou non (faille réelle). Après correction : `truncate app_security.refus;`
4. **Bloquer**, une fois la liste sans action légitime :
   ```sql
   select app_security.set_mode('enforce');
   ```
5. En cas de problème : `select app_security.set_mode('observe');` (immédiat), ou le script de retour arrière.

À faire avant de bloquer : désactiver « Allow new users to sign up » (Authentication). Sinon, quelqu'un peut créer un compte avec l'e-mail d'une fiche pas encore rattachée.

## Ce que le lot A ne couvre pas

- **Comptes de connexion** : contrôlés par la fonction `admin-manage-user` (voir `docs/MOTS-DE-PASSE.md`). Déployer cette fonction avant de bloquer : l'ancienne version laisse tout profil Exploitation actif changer n'importe quel mot de passe.
- **Lectures** : tout ce qui est lisible aujourd'hui le reste (lot B).
- **Autres tables** : `agences`, `planning`, `pointages`, tickets, absences, matériel, `push_subscriptions`, messages (lots B et C).
- **Fichiers** du stockage (lot C).

## Modifier une règle

Toute nouvelle écriture sur une table protégée doit être prévue ici. Les règles sont les fonctions `app_security.rule_*` ; ajouter une migration qui les remplace (`CREATE OR REPLACE`), et un cas dans `tests/db/securite-lot-a.mjs` :

```bash
npm install --no-save @electric-sql/pglite && node --test tests/db/securite-lot-a.mjs
```

Les droits Exploitation sont recalculés en SQL (`app_security.exploitation_level`) avec la même règle que `src/lib/exploitationProfiles.js` ; un test compare les deux.
