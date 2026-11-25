# Audit du code et refonte progressive — 24 novembre 2026

## État observé

- Application React 18 / Vite 4 en JavaScript et JSX ; 296 fichiers sous `src`, dont 104 pages JSX.
- 47 pages JSX et 7 composants JSX contiennent encore un accès direct à `supabase.from(...)`. La couche d'accès aux données est donc partagée entre l'interface et `src/lib`.
- Pages les plus volumineuses : `SalaireGuichetiereTab.jsx` (6 088 lignes), `ProfilsExploitationPage.jsx` (3 386 avant ce chantier), `PointsVenteMobiPage.jsx` (2 969), `MaintenanceTab.jsx` (2 864), `ConfigurationTab.jsx` (2 456). Le volume seul n'est pas un défaut, mais ces fichiers combinent état, requêtes, règles métier et affichage.
- Points déjà en place : routes chargées à la demande dans `App.jsx` (51 imports `lazy`), ESLint, tests Playwright et unitaires, `ErrorBoundary`, suivi Sentry optionnel, fonctions métier partagées dans `src/lib`.
- `npm run build` passe. Le lint global signale 883 avertissements et aucune erreur bloquante. Les avertissements comprennent des accès directs aux données, des dépendances de hooks et du code inutilisé ; ils doivent être résolus par périmètre plutôt que masqués globalement.
- La suite unitaire complète (`node --test --test-isolation=none tests/*.unit.mjs tests/unit/*.test.js`) est maintenant verte : 113 réussites sur 113. Trois échecs de référence ont été corrigés lors de la vérification suivante : une attente figée à 26 guides alors que le catalogue en contient 30, et une taille de page Mobi de 1 000 qui pouvait produire une liste incomplète face à une limite serveur de 500.
- Les plus gros fichiers de sortie observés après build incluent les chunks `xlsx` (418 kB), `jspdf` (411 kB), `vendor-charts` (452 kB) et `en` (386 kB), avant compression. Le chargement réel et l'usage de ces chunks restent à mesurer dans le navigateur avant optimisation.

## Structure cible, sans déplacement massif

```text
src/
  features/
    profils/
      profileModel.js       # règles pures, constantes et calculs
      profileRepository.js  # accès aux tables du domaine
      components/           # panneaux, listes et formulaires du domaine
      hooks/                # orchestration d'état si elle est réutilisée
    salaires/
    maintenance/
    terminaux/
    mobi/
  lib/                      # services réellement transversaux
  pages/                    # composition des écrans et navigation
```

Les pages appellent les fonctions du domaine. Les modèles ne dépendent ni de React ni du réseau. Les dépôts de données reçoivent le client Supabase en argument, ce qui permet des tests sans base réelle. Les composants partagés restent dans `src/components` ; on extrait un composant local seulement lorsqu'il rend la page plus lisible ou qu'il est réutilisé.

## Ordre de migration

| Lot | Module | Travail prioritaire | Critère de sortie |
| --- | --- | --- | --- |
| 0 | Référence | **Terminé** : 3 échecs unitaires corrigés ; niveau d'avertissements lint noté | Suite unitaire fiable avant les changements métier |
| 1 | Profils et fonctionnalités | **Démarré** : modèle et premières lectures isolés ; poursuivre par `app_settings`, écritures et composants de formulaire | Règles de permission testées ; requêtes de la page déplacées sans modifier les droits |
| 2 | Salaires | Extraire calculs, rapprochements, chargements puis sections d'interface depuis la page de 6 088 lignes | Cas de montants, arrondis et périodes couverts par tests métier |
| 3 | Maintenance et terminaux | Séparer configuration, stock, réparations, historique et actions sur les sous-ensembles | Parcours d'affectation et de libération vérifiés de bout en bout |
| 4 | Points de vente Mobi | **Pagination corrigée** ; isoler ensuite les règles d'affectation et de rentabilité des requêtes et vues | Pas de perte sur les historiques et grands volumes |
| 5 | Transversal | Réduire les accès Supabase directs restants, préciser les contrats de données et le diagnostic des erreurs | Une responsabilité claire par module et des erreurs traçables |

Chaque lot suit le même cycle : comportement de référence, extraction des fonctions pures, extraction des requêtes, découpage de l'interface si utile, tests ciblés, lint ciblé, build et contrôle du parcours concerné. On conserve les clés de stockage et les formats de données existants pendant ces extractions.

## Première étape livrée dans ce chantier

- `src/features/profils/profileModel.js` contient les configurations des espaces gérés, les valeurs initiales et les calculs de droits utilisés par la page.
- `src/features/profils/profileRepository.js` porte les chargements de profils, modèles et utilisateurs par espace. Les erreurs restent associées à leur espace et affichées par la page.
- `ProfilsExploitationPage.jsx` consomme ces fonctions ; ses requêtes de chargement initial et des utilisateurs gérés ne sont plus écrites dans le composant.
- `tests/profils.unit.mjs` vérifie l'indépendance des formulaires, les comptages de droits, la sélection des descendants et le comportement des requêtes en succès/échec.

## Vérification du lot 1 

- `node tests/profils.unit.mjs` : 4 tests réussis.
- `npx eslint src/pages/exploitation/ProfilsExploitationPage.jsx src/features/profils` : 0 erreur, 25 avertissements sur la page (requêtes et dette déjà présentes).
- `npm run build` : réussi.
- Parcours authentifié du module Profils non exécuté dans ce chantier : les tests Playwright nécessitent les identifiants de l'espace concerné.

## Vérification des lots suivants

### Lot 0 — référence : terminé

- `fetchAllMobiTerminals` demande désormais 500 lignes par page, taille compatible avec le plafond simulé par le test. Les 2 386 terminaux sont chargés et une erreur sur une page interdit de présenter une liste partielle.
- Le test de catalogue des guides vérifie une liste non vide, l'unicité des identifiants et leur répartition exacte dans les catégories, sans figer le nombre de guides.
- `npm run test:unit` lance la suite unitaire complète. `npm run verify:baseline` enchaîne tests unitaires, lint et build ; les avertissements lint connus restent visibles et ne bloquent pas cette vérification.
- Suite unitaire complète : 113 tests réussis sur 113.

### Lot 2 — salaires : prêt pour extraction

- `SalaireGuichetiereTab.jsx` compte 6 088 lignes et au moins 21 accès directs aux tables ou à la vue CCOPE. Les données de référence, opérations, versements, objectifs et formules sont encore orchestrés dans le composant.
- `src/lib/salaryReconciliation.js` et ses tests fournissent déjà une base pour le rapprochement. Première extraction conseillée : lecture des référentiels et de la période, puis règles d'objectifs et de formules. Vérifier les arrondis et les périodes avant de déplacer les mutations.
- Les tests Playwright de l'assistant salaire utilisent une fixture isolée ; ils ne couvrent pas la page authentifiée complète.

### Lot 3 — maintenance et terminaux : prêt pour extraction

- `MaintenanceTab.jsx` (2 864 lignes) et `ConfigurationTab.jsx` (2 456 lignes) contiennent respectivement au moins 12 et 27 accès directs à Supabase. La configuration répète les lectures des douze familles de sous-ensembles ; cette liste est une première candidate pour un dépôt de données dédié.
- Les mutations d'affectation, de remplacement et de stock impliquent plusieurs tables. Les extraire avec un contrat d'erreur explicite et vérifier chaque état intermédiaire avant de modifier les formulaires.
- Les tests de formulaire Playwright couvrent une fixture avec données simulées ; ils ne valident pas encore la persistance réelle.

### Lot 4 — points de vente Mobi : correction appliquée, extraction à poursuivre

- `PointsVenteMobiPage.jsx` compte 2 969 lignes. Sa lecture paginée des historiques utilisait aussi une demande de 1 000 lignes ; elle utilise maintenant le défaut de 500 pour éviter un arrêt prématuré si le serveur limite les réponses à 500.
- Les règles de validité et de rentabilité disposent déjà de modules et tests unitaires. Prochaine extraction : chargement des référentiels et historiques, puis cache de session et mutations, en gardant les contrôles de conflit de dates.
- Les tests Playwright de recherche Mobi vérifient une fixture isolée ; le parcours authentifié de la page reste à vérifier.

### Contrôles effectués

- `node --test --test-isolation=none tests/*.unit.mjs tests/unit/*.test.js` : 113/113 réussis.
- Playwright ciblé (`12-salary-assistant`, `18-maintenance-forms`, `15-mobi-terminal-search`) : 11/11 réussis sur fixtures.
- `npm run build` : réussi.
- ESLint ciblé sur les quatre grandes pages des lots 2 à 4 : 0 erreur, 143 avertissements. Les avertissements servent de référence pour les étapes d'extraction.
