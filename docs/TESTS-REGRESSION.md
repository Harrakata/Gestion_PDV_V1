# Régression fonctionnelle et visuelle

Ce document décrit ce que la suite vérifie réellement. Un test vert sur des données simulées ne valide pas une connexion à la base du client ; un parcours connecté ignoré faute d'identifiants ne compte pas comme vérifié.

## Commandes

| Commande | Périmètre | Prérequis |
| --- | --- | --- |
| `npm run verify:baseline` | Tests unitaires, lint à cliquet, build | Dépendances installées |
| `npm run lint:ratchet` | 0 erreur ESLint ; chaque type d'avertissement ne peut que baisser (`scripts/lint-baseline.json`) | Idem |
| `npm install --no-save @electric-sql/pglite && node --test tests/db/mots-de-passe.mjs` | Effacement des mots de passe en clair, sur un PostgreSQL embarqué | Téléchargement de PGlite |
| `npm install --no-save @electric-sql/pglite && node --test tests/db/securite-lot-a.mjs` | Règles de sécurité de la base, rôle par rôle, sur un PostgreSQL embarqué | Téléchargement de PGlite |
| `npm run test:regression:local` | Fixtures et services simulés : métier, formulaires, navigation, mobile, design | Chromium Playwright installé |
| `npm run verify:regression:local` | Référence complète puis suite locale | Idem |
| `npm run test:regression:authenticated` | Parcours réels des sept espaces, lecture et navigation | Identifiants de chaque espace, `RECETTE_SUPABASE_URL`, `RECETTE_SUPABASE_ANON_KEY` et `E2E_ISOLATED_ENV=1` |
| `npm run test:regression:mutating` | CRUD, jeu de test, absences, tickets et remontées | Comme ci-dessus, plus `RUN_MUTATING_TESTS=1` |

## Isolation des bases

- **Suite locale** : serveur dédié (port 5183) branché sur une adresse Supabase inexistante, et navigateur qui ne résout que `localhost`. Une requête oubliée par un test échoue au lieu d'atteindre une base réelle.
- **Suites connectées** : serveur dédié (port 5193) branché sur `RECETTE_SUPABASE_URL`. L'exécution est refusée si cette adresse est celle du fichier `.env`, ou si la configuration par défaut est utilisée avec `E2E_ISOLATED_ENV=1` ou `RUN_MUTATING_TESTS=1`.

## Intégration continue

`.github/workflows/playwright.yml` s'exécute à chaque envoi, sur toute branche : tests unitaires, lint à cliquet et build, puis la suite locale en trois parties. Aucune étape ne contacte une base réelle. Les parcours de recette se lancent à la main (Actions → Vérification → Run workflow → « recette ») ; ils demandent un environnement GitHub `recette` contenant les secrets `RECETTE_SUPABASE_URL`, `RECETTE_SUPABASE_ANON_KEY` et les identifiants des sept espaces.

## Créer la base de recette (une fois)

1. Créer un projet Supabase « recette », puis cloner la structure, sans donnée métier : `bash scripts/multi-client/provision-client.sh --from pmu-mali --to recette` (voir [Onboarding](ONBOARDING-NOUVEAU-CLIENT.md), étapes 1.1 à 1.6).
2. Créer le premier administrateur (étape 3.1), puis un compte par espace depuis l'application.
3. Renseigner les variables ci-dessus dans le terminal (ou dans l'environnement GitHub `recette`), jamais dans un fichier suivi par git.
4. Profiter de l'occasion pour remplir `scripts/schema.sql` (`bash scripts/dump-schema.sh`) : il est vide à ce jour.

## Précisions

Les commandes authentifiées arrêtent immédiatement l'exécution si un jeu d'identifiants manque. Les scénarios qui écrivent en base sont exclus de la suite locale. La suite de mutations peut créer des données persistantes : consulter `tests/README.md` pour les options de purge et les scénarios de maintenance.

## Matrice de couverture

| Domaine | Tests locaux ou unitaires | Parcours connectés | Écriture réelle |
| --- | --- | --- | --- |
| Accueil et navigation des espaces | `20`, `21`, `28`, `29`, `32`, `33` (sept espaces : connexion, tous les menus, déconnexion) | `01`, `02`, `03` | — |
| Profils, droits et fonctionnalités | `14`, `33` (menus autorisés, lecture seule, profil inactif ou d'un autre espace, mot de passe obligatoire du chef d'agence, accès de mise en service), `36` (Paramètres et Contrôle présence en lecture seule, formules de salaire par rôle), `37` (fiches et comptes d'accès, réaffectation des chefs, imports sans mot de passe), `accountManager.test.js`, `accountsRepository.test.js`, `reassign.test.js`, `profils.unit.mjs`, `exploitationProfiles.test.js` | `02` | À compléter |
| Salaires, caisse et rapprochement | `12`, `23`, `36`, `salaryReconciliation.unit.mjs`, `customFormulas.test.js` | `02`, `05` | À compléter |
| Maintenance, terminaux, pièces et stock | `18`, `19`, `22`, `23`, `27` | `02`, `03`, `05` | `06` (options de maintenance) |
| Points de vente Mobi et rentabilité | `15`, `mobiPointValidity.unit.mjs`, `mobiPointCsv.unit.mjs`, `mobiRentabilite.unit.mjs`, `terminauxMobi.unit.mjs` | `02`, `03` | À compléter |
| Référentiels et formulaires | `17`, `22` | `02` | `04`, `06` |
| Absences et planning | `25` | `03` | `08` |
| Tickets, remontées et photos | `30` | `03` | `09`, `11` |
| Rapports, notifications et assistant | `13`, `23`, `34` (volume des lectures automatiques, réactivité de la cloche et des écrans de paiement), `35` (volumes et fonctionnement par mode de ressources, rattachement et envoi des push, conservation des journaux, listes longues), `liveFeed.test.js`, `resourceMode.test.js`, `activityRetention.test.js`, `rowEntrance.test.js`, `pushRecipients.test.js` (destinataires d'un message) | `07`, `10` | Selon les scénarios |
| Thème, contrastes, mobile, langue | `16`, `21` à `26`, `28`, `29`, `31`, `32`, `themeContrast.test.js`, `i18n.test.js` | `01` à `03` | Personnalisation simulée par `24` |

Les numéros renvoient aux fichiers `tests/<numéro>-*.spec.ts`. Les tests `33` montent l'application complète sur une base simulée (`tests/helpers/simulatedBackend.ts`) : ils vérifient aussi que parcourir les menus ne modifie aucune donnée. Les tests `32` vérifient dans un navigateur les contrats des composants partagés : liseré unique et lié au thème, surface des onglets, centrage, répartition, formulaire accessible et taille de contrôle sur téléphone. Les tests `23` et `29` couvrent déjà le contraste, le débordement et la marque sur des écrans représentatifs.

## Règles pour chaque nouveau module

1. Ajouter des tests unitaires pour les règles métier pures, surtout dates, montants, droits et pagination.
2. Ajouter un scénario sur données simulées pour au moins un état normal, un état vide et une erreur pertinente.
3. Vérifier les états clair et sombre, la largeur téléphone et la navigation clavier lorsqu'une nouvelle interface est introduite.
4. Couvrir la route réelle dans la suite authentifiée. Le registre des menus Exploitation alimente directement `02-exploitation.spec.ts` : une nouvelle entrée de menu ajoute son contrôle de route.
5. Ajouter un cycle d'écriture sur la base de recette lorsque la fonctionnalité modifie plusieurs tables ou des permissions. Prévoir le nettoyage des données de test.

## Limites connues

- Les parcours authentifiés ne peuvent pas être exécutés localement sans base ni identifiants de recette. Les tests locaux vérifient l'interface et les règles avec des données simulées : ils ne valident ni les règles d'accès de la base (RLS), ni les fonctions SQL, ni les volumes réels.
- Les cycles CRUD réels couvrent principalement Région et le jeu de données de maintenance. Les créations et modifications de chaque entité métier ne sont pas encore toutes couvertes.
- Le résultat d'une suite ne garantit pas l'absence de régression sur toutes les combinaisons de rôles, droits, langues et données. La matrice doit évoluer avec les fonctionnalités.
