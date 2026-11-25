# Modes de ressources : Dev, Démo, Prod

Un mode règle la consommation Supabase de l'application. Il ne change ni les droits, ni les règles métier, ni les écrans disponibles. Les valeurs sont dans `src/lib/resourceMode.js` (`RESOURCE_PROFILES`) ; l'écran Paramètres affiche le même tableau.

| | Dev | Démo | Prod |
|---|---|---|---|
| Usage | développer et tester | démonstration, POC sur l'abonnement gratuit | client réel, abonnement payant |
| Temps réel | non | oui | oui |
| Actualisation de la cloche et des écrans suivis (temps réel actif) | — | 15 min | 5 min |
| Actualisation sans temps réel | 30 min | 3 min | 1 min |
| Actualisation en arrière-plan | jamais | 1 h | 15 min |
| Signal de présence | 15 min, écran affiché | 5 min, écran affiché | 2 min |
| Journal de navigation | connexions seulement | regroupé par minute | immédiat |
| Santé de la synchro, sans changement | jamais | 2 h | 30 min |
| Photos (tickets, interventions) | 1024 px | 1280 px | 1600 px |
| Mode strict de React (serveur de développement) | non | oui | oui |

Dans tous les modes, les données s'actualisent aussi à l'ouverture d'un écran, au retour sur l'application et à l'ouverture de la cloche. Avec le temps réel, un changement arrive aussitôt : l'intervalle n'est qu'une sécurité.

## Choisir le mode

Priorité, de la plus forte à la plus faible :

1. **Sur cet appareil** — Paramètres → Mode de ressources → « Pour moi ». Pour essayer un mode sans l'imposer aux autres.
2. **Par le déploiement** — variable `VITE_RESOURCE_MODE` (`dev`, `demo` ou `prod`). Impose le mode à tous ; un changement demande un nouveau déploiement.
3. **Par le client** — Paramètres → Mode de ressources → « Pour tous les utilisateurs » (`app_settings/resource_mode`).
4. **Par défaut** — Dev sur le serveur de développement (`npm run dev`), Démo ailleurs.

Le mode est fixé au démarrage : un changement s'applique au prochain chargement de l'application. **Un client en production doit choisir Prod**, sinon il reste en Démo.

Poste de développement branché sur la base de démonstration : mettre `VITE_RESOURCE_MODE=dev` dans `.env`.

## Mesures

Version compilée, base simulée, écran ouvert **une heure sans action**, temps réel disponible. Nombre d'appels à Supabase : écran affiché / en arrière-plan.

| Espace | Dev | Démo | Prod |
|---|---|---|---|
| Exploitation | 15 / 0 | 34 / 6 | 94 / 54 |
| Chef d'agence | 14 / 0 | 32 / 5 | 90 / 50 |
| Guichetière | 10 / 0 | 24 / 3 | 66 / 42 |
| Technicien | 12 / 0 | 28 / 4 | 78 / 46 |

Plafonds vérifiés par `tests/35-resource-modes.spec.ts` (Dev, Démo) et `tests/34-notification-traffic.spec.ts` (Prod).

## Abonnement gratuit Supabase

| Ressource | Limite mensuelle | Ce qui la consomme ici |
|---|---|---|
| Journaux (Log Ingestion) | 1 Go | chaque appel, y compris les vérifications CORS du navigateur |
| Trafic sortant | 5 Go (+ 5 Go en cache) | listes chargées, photos affichées |
| Base de données | 500 Mo par projet | données, historiques, journaux d'activité et d'audit |
| Fichiers | 1 Go | photos, pièces d'identité, fiches |
| Edge Functions | 500 000 appels | push, rappels, SMS, assistant |
| Temps réel | 200 connexions simultanées, 2 millions de messages | un appareil connecté = une connexion ou plus ; un changement = un message par appareil à l'écoute |
| Projets | 2 actifs, mis en pause après une semaine sans activité | ouvrir l'application de démonstration au moins une fois par semaine |

Sources (consultées le 25/11/2026) : [tarifs](https://supabase.com/pricing), [journaux](https://supabase.com/docs/guides/platform/manage-your-usage/logs-ingest), [messages temps réel](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages). Les journaux ne sont pas encore facturés (période de grâce annoncée jusqu'à début 2027) ; sur l'abonnement gratuit, un dépassement n'est pas facturé mais ouvre une période de grâce. Les journaux de la passerelle ne peuvent pas être filtrés : seul le nombre d'appels compte.

## Suivre la consommation

À exécuter dans l'éditeur SQL (lecture seule) :

```sql
-- Taille de la base et plus grosses tables
select pg_size_pretty(pg_database_size(current_database()));
select relname, pg_size_pretty(pg_total_relation_size(relid)) as taille
from pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 15;

-- Réglages Postgres qui alimentent les journaux
select name, setting from pg_settings
where name in ('log_statement', 'log_min_duration_statement', 'log_connections', 'log_disconnections',
               'log_lock_waits', 'log_temp_files', 'log_autovacuum_min_duration', 'log_min_messages');

-- Tables diffusées en temps réel
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
```

## Purge des journaux d'activité

Connexions et navigations (`activites_sessions`, `activites_evenements`) grossissent sans limite. La migration `202611251200_purge_journaux_activite.sql` installe une purge, **inactive par défaut**. Elle s'active par client dans Paramètres → Mode de ressources → Journaux d'activité (30 jours, 90 jours, 1 an ou tout) : l'écran annonce le nombre de lignes concernées avant de confirmer.

- Exécution chaque nuit à 03 h 20 UTC par pg_cron, au plus 50 000 lignes par table : une grosse reprise s'étale sur plusieurs nuits.
- Jamais moins de 30 jours conservés. Réglage absent ou illisible : rien n'est supprimé.
- `audit_log` (audit) et `connexions_chefs` (connexions des chefs d'agence) ne sont pas concernés.
- L'application ne peut pas déclencher la purge ; l'éditeur SQL le peut : `select public.purge_activity_logs();`
- La place libérée est réutilisée par la base, mais la taille affichée ne baisse qu'après `vacuum full public.activites_evenements;` (bloque la table pendant l'opération).

Aperçu de ce que 30 jours supprimeraient :

```sql
select (select count(*) from public.activites_sessions where last_seen_at < now() - interval '30 days') as connexions,
       (select count(*) from public.activites_evenements where created_at < now() - interval '30 days') as evenements;
```

Désinstaller : `select cron.unschedule('purge-activity-logs');`

## Ajouter un comportement au mode

Ajouter la valeur aux trois profils de `RESOURCE_PROFILES`, la lire par `resources` (`@/lib/resourceMode`), et ajouter sa ligne au tableau de `ResourceModeSection.jsx`. `tests/unit/resourceMode.test.js` vérifie que Dev consomme moins que Démo, et Démo moins que Prod.
