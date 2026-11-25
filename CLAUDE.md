# CLAUDE.md

Guide pour travailler efficacement dans ce dépôt. Voir aussi `docs/ONBOARDING-NOUVEAU-CLIENT.md` (mise en service d'un client), `docs/MODES-RESSOURCES.md` (Dev, Démo, Prod) et `database_setup.md` (schéma).

## Présentation

Application web (PWA) de **gestion de points de vente / agences** pour un opérateur de paris (PMU). Elle assure la continuité de l'activité pour tous les rôles terrain et back-office : guichetières, chefs d'agence, chefs de secteur, techniciens/maintenance, directeurs régionaux/généraux, exploitation.

Le produit est **multi-client** pour le compte d'un fournisseur de service : **un seul code**, décliné par client via configuration (voir « Multi-tenant »).

## Stack

- **Front** : React 18 + Vite 4, React Router 6, Tailwind + Radix UI (composants dans `src/components/ui/`), framer-motion, recharts, lucide-react.
- **Back** : Supabase (PostgreSQL, Auth, Storage, Edge Functions Deno dans `supabase/functions/`).
- **PWA** : `vite-plugin-pwa` (service worker, installable, mode hors-ligne).
- **Observabilité** : Sentry (`@sentry/react`).
- **Intégrations** : PowerBI (`powerbi-client`), MSAL (`@azure/msal-browser`), Twilio SMS (Edge Function `notify-parieur-sms`).
- **Tests** : Playwright E2E (`tests/`).

## Commandes

```bash
npm run dev              # serveur de dev Vite
npm run build            # build de production (vers dist/)
npm run preview          # prévisualiser le build
npm run test:e2e         # tests Playwright
npm run test:e2e:ui      # Playwright en mode UI
npm run test:e2e:report  # rapport du dernier run
npm run lint             # ESLint (0 erreur attendue ; les warnings = dette à résorber)
npm run lint:ratchet     # échoue si un type d'avertissement augmente (-- --update enregistre une baisse)
npm run test:unit        # tests unitaires
npm run verify:baseline  # unitaires + lint à cliquet + build
npm run test:regression:local  # tests d'interface sur base simulée (aucune base réelle)
npm run lint:fix         # corrections automatiques
npm run i18n             # textes sans traduction anglaise (0 attendu)
```

## Architecture

- `src/App.jsx` — routing. Toutes les pages sont en `lazy()` + `Suspense` + `ErrorBoundary` ; un `Layout` enveloppe les routes authentifiées. `FeatureFlagsProvider` est monté au sommet.
- `src/pages/` — pages par espace : racine (`Espace*Page.jsx`) puis sous-dossiers `exploitation/`, `chef_agence/`, `guichetiere/`, `maintenance/`, `pointage/`, `technicien/`.
- `src/components/` — composants partagés ; `ui/` = primitives Radix/Tailwind ; sous-dossiers par domaine (`analytics/`, `maintenance/`, `paiement_gain/`, `mobile/`…).
- `src/hooks/` — hooks transverses (session, fonctionnalités, notifications, activité, photos…).
- `src/lib/` — logique métier et services (config client, profils exploitation, offline, géoloc, paiement gain, planning, pointage, audit…).
- `src/features/<domaine>/` — domaines refondus : `<domaine>Model.js` (règles pures), `<domaine>Repository.js` (seul endroit qui interroge Supabase, client reçu en argument).
- `supabase/migrations/` — migrations SQL. `supabase/functions/` — Edge Functions.

## Multi-tenant (1 client = 1 projet Supabase + 1 déploiement)

Modèle : **codebase unique**, **un projet Supabase et un déploiement (Vercel) par client**. Trois couches de personnalisation, sans fork de code :

1. **Identité / branding** — `src/lib/clientConfig.js`. Vient des variables d'env du déploiement (`VITE_CLIENT_ID`, `VITE_CLIENT_NAME`, `VITE_CLIENT_LOGO_URL`, `VITE_STORAGE_BUCKET`), surchargeables en base via `app_settings/client_branding`.
2. **Fonctionnalités (modules/espaces)** — **source de vérité unique** : le système `functionalites_espaces` (cf. `src/lib/exploitationProfiles.js`, catalogue `APP_SPACE_FUNCTIONALITIES`), éditable dans l'app (Espace Exploitation → « Profil et Fonctionnalité »). Comme chaque client a sa base, c'est déjà par-client.
3. **Kill-switch de déploiement** — `VITE_FEATURES_DISABLED` / `VITE_FEATURES_ENABLED` (listes de clés du catalogue) forcent l'état d'une fonctionnalité, **priorité absolue** sur la base. Appliqué via `applyFeatureEnvOverrides`.

Le hook **`src/hooks/useFeatureFlags.jsx`** unifie le tout : il LIT les fonctionnalités (depuis le `localStorage` alimenté par `Layout.jsx` au boot, event `app-functionalities-updated`), applique l'override env, et charge branding + structure org. Ne pas créer de second fetch des fonctionnalités. Usage : `useFeature('ccope')` → bool ; `useFeatureFlags()` → `{ flags, client, org, ... }`.

Pour ajouter un module : l'ajouter au catalogue `APP_SPACE_FUNCTIONALITIES`, le router dans `App.jsx`, et le garder optionnel via un flag.

## Langues (français / anglais)

Le code s'écrit **en français** ; l'anglais est obtenu **à l'affichage** (`src/i18n/`). Ne pas appeler de fonction de traduction dans les écrans.

- **Comment** : `vite.config.js` fait passer le JSX de l'application par `src/i18n/jsx-runtime.js`, qui traduit les textes et les attributs `placeholder`, `title`, `alt`, `aria-label`, `data-label`. Dictionnaire : `src/i18n/locales/en.json` (`text`, `patterns` pour les textes assemblés, `mixed` pour le JSX entrecoupé de valeurs), téléchargé seulement en anglais. En français, ce sont les fonctions de React, sans surcoût.
- **Quelle langue** : choix personnel sur l'appareil (Profil → Préférences) → langue du client (Paramètres → Langue, `app_settings/app_language`) → `VITE_CLIENT_LANGUAGE` → français. Fixée au démarrage : en changer recharge la page.
- **Nouveau texte** : l'écrire en français, lancer `npm run i18n`, ajouter la traduction dans `en.json` (ou dans `ignored.json` s'il ne se traduit pas). Le test `tests/unit/i18n.test.js` échoue s'il en manque.
- **Hors JSX** (titre d'onglet, export, notification, HTML imprimé) : `t(texte)` ou `translateHtml(html)` de `@/i18n/translate`, appelés au moment de l'affichage (jamais au chargement du module : le dictionnaire n'est pas encore là).
- **Dates et nombres** : `appLocale()` (`@/i18n/language`), jamais `'fr-FR'` ; `import { fr } from 'date-fns/locale'` suit déjà la langue.
- **Logique** : comparer des clés ou des valeurs, jamais un texte affiché (`textContent`, `children`, `title`). Un composant qui doit lire le texte d'origine de ses enfants porte `readsSourceText = true` (cf. `StatusBadge`). `translate="no"` exclut un élément.
- Pas d'entrée d'un seul mot qui soit aussi un prénom (« Rose », « Sam ») : il serait traduit dans les noms.

## Mode hors-ligne

Pensé pour le terrain en connexion instable. Voir `src/lib/offlineCache.js`, `offlineQueue.js`, `offlineSync.js` et le composant `OfflineSyncIndicator`.

- **Lecture** : `cachedQuery` met en cache (IndexedDB) le résultat des requêtes.
- **Écriture** : file d'attente (`enqueueOffline`) rejouée à la reconnexion.
- Activable par écran via les flags `offline_mode*`. Le **paiement gros gain est volontairement en lecture seule hors-ligne**.

## Conventions & pièges (IMPORTANT)

- **Alias `@` → `src/`** (`vite.config.js`). Importer en `@/lib/...`, `@/components/...`.
- **Ordre de résolution des extensions = `['.jsx', '.js', '.tsx', '.ts', '.json']`** (`vite.config.js`). ⚠ Un import **sans extension** charge le `.jsx` **avant** le `.js`. Ne jamais laisser coexister `foo.js` et `foo.jsx` : c'est une source de bugs silencieux (mauvaise version chargée). Toujours dédoublonner.
- Pages lazy-loadées : enrober tout nouvel écran dans le pattern `LazyRoute` existant.
- Le build terser **supprime `console.*` et `debugger`** en prod — ne pas compter sur les logs en production.
- `app_settings` n'a pas de contrainte unique garantie sur `key` : utiliser le pattern *select-then-update/insert* (cf. `saveClientBranding`).
- Audit & historique : `src/lib/auditLog.js` + historique SCD2 (`Scd2HistoryDialog`).
- **Erreurs** : ne jamais afficher `error.message` brut. Dans un toast : `description: describeError(error, 'NomDuComposant')` (`src/lib/errors.js`) — signale à Sentry avec l'origine + traduit en message utilisateur. Erreur silencieuse à tracer : `reportError(error, { where })`. Sur appareil, `window.__gpdvErrors()` (console) liste les 30 dernières erreurs.
- **Confirmations / saisies courtes** : `const { confirm, prompt } = useConfirm()` (`ConfirmDialogProvider`, monté dans `App.jsx`). `window.confirm/prompt/alert` sont interdits par ESLint.
- **Session** : chaque espace connecté appelle `useSessionTimeout(null, () => handleLogout(), <cléAuth>, { enabled: isAuthenticated })` (durée : Paramètres → `sessionDureeMinutes`). Tout nouvel espace doit faire de même.
- **Données vivantes** : jamais de `setInterval(charger, …)` vers Supabase (chaque appel est journalisé et facturé). Écran : `useLiveRefresh(nom, sources)` ; cloche : `SPACE_SOURCES` (`src/features/notifications/`). Les deux passent par `src/lib/liveFeed.js` : temps réel, sinon lecture espacée, rien hors-ligne. Une table n'est écoutée que si elle est dans la publication `supabase_realtime` (`enable_realtime_notifications.sql`) : sans elle, repli automatique sur une lecture par minute. Ne pas écouter une table que chaque appareil écrit régulièrement (`sync_health`, `activites_sessions`). Plafonds vérifiés par `tests/34-notification-traffic.spec.ts`.
- **Listes animées** : `{...rowEntrance(index, { y: 12 })}` (`src/lib/rowEntrance.js`) sur `motion.tr` / `motion.div`, jamais `delay: index * …` (une liste de 900 lignes mettait 18 s à s'afficher). Vérifié par `tests/unit/rowEntrance.test.js`.
- **Journaux d'activité** : purge faite par la base selon `app_settings/activity_retention` (inactive par défaut, jamais moins de 30 jours) ; voir `docs/MODES-RESSOURCES.md`.
- **Sécurité de la base** : les écritures sur les profils, fiches, paiements de gain, réglages et salaires sont contrôlées par la base (`app_security`, voir `docs/SECURITE-LOT-A.md`). Une nouvelle écriture sur ces tables doit être prévue dans les règles et testée (`tests/db/securite-lot-a.mjs`). Masquer un bouton ne protège rien.
- **Comptes d'accès** : créer, changer ou supprimer un compte passe uniquement par `createAccountsRepository(supabase, <table>)` (`src/features/comptes/`) ; les droits sont contrôlés par la fonction serveur (`supabase/functions/_shared/accountManager.js`, voir `docs/MOTS-DE-PASSE.md`). Jamais de mot de passe dans une fiche, un `select` ou un import. Une liste qui ouvre un formulaire charge `email` et `auth_user_id`, sinon l'enregistrement détache le compte.
- **Changer d'affectation** (chef d'agence, chef de secteur) : `reassign` (`src/features/personnel/reassignRepository.js`). La fiche en cours garde son `id` (compte, droits, demandes et statistiques y sont rattachés) ; l'ancienne affectation est une copie archivée. Une connexion ne lit que la fiche en cours (`statusCol: 'is_current'`).
- **Lecture seule** : un écran Exploitation lit `canWriteCurrentPage` (`useOutletContext`) ; dans Paramètres, `useReadOnlySettings()` + `<SettingsFields>` (champs désactivés), actions masquées, et refus dans chaque enregistrement. Vérifié par `tests/36-settings-read-only.spec.ts`.
- **Formules de salaire personnalisées** : uniquement par `src/features/salaires/customFormulasRepository.js` (relit la liste avant d'écrire) ; ne jamais réécrire la liste affichée.
- **Mode de ressources** : Dev, Démo ou Prod (`src/lib/resourceMode.js`, choix dans Paramètres ou `VITE_RESOURCE_MODE`). Tout appel automatique ou poids d'envoi se règle par `resources.*`, jamais par une durée en dur. Le mode ne change aucun droit ni règle métier.
- **Réglages** : `loadAppSetting` / `readAppSetting` (`src/lib/appSettings.js`) regroupent les lectures de `app_settings` faites au même moment. Ne pas relire la table une clé à la fois au démarrage.
- **Photos** : `lightenPortrait` (profil), `lightenDocument` (pièce d'identité) ou `preparePhoto` (`src/lib/photos.js`) avant tout envoi ; jamais le fichier d'origine.
- **Push** : message de l'exploitation → `triggerMessagePush(id, rôles)` ; la fonction `send-push` choisit les destinataires avec la même règle que la cloche (`src/features/notifications/messageAudience.js`). Autres alertes → `triggerPush(cible, contenu)`, cible obligatoire.
- **Monitoring** : Sentry actif si `VITE_SENTRY_DSN` est défini ; le contexte (client, espace, id utilisateur) est posé par `useActivityTracker`.
- **Couleurs** : uniquement les jetons du thème — états : `destructive`, `success`, `warning`, `info`, et `highlight` pour une distinction sans jugement (calculé, national) (+ variantes `-muted` / `-muted-foreground` pour les fonds/textes de badge) ; neutres : `muted`, `muted-foreground`, `foreground`, `border` ; surfaces : `bg-card` (jamais `bg-white`, sauf zone de signature qui doit rester blanche). Sur un fond plein : `text-<jeton>-foreground`, jamais `text-white`. Le mode sombre et le branding client en dépendent. ESLint signale les couleurs en dur (toutes palettes, dégradés, `bg-[#…]`).
- **Cartes** : bloc principal / en-tête d'écran = `<Card variant="accent">` (le liseré bleu est dessiné par le composant — ne pas l'ajouter à la main, ne pas ajouter d'ombre/bordure/flou : la variante garantit un rendu identique partout). Le style `glassmorphism` est obsolète (rendu = carte standard).
- **Libellés de champ** : tout `<Label>` directement suivi de son champ (liste, saisie, date, zone de texte, `PasswordInput`) s'affiche automatiquement DANS la zone du champ (CSS global, fin de `src/index.css`). Conserver cette structure `label + champ` (frères directs) ; ne pas re-créer de libellé au-dessus. Une liste `Select` qui contient une option « toutes » (`__all__`/`all`/`tous`) est traitée comme un FILTRE : sur « toutes » → seul le titre ; valeur choisie → seule la valeur, en style « filtre actif » (comme les `Combobox multi`). Sans option « toutes » → champ de formulaire : titre au-dessus de la valeur.
- **Titres** : tailles imposées globalement (PC : en-tête d'écran 1.5rem, autres titres de carte 1.125rem ; mobile : 1rem / 0.8125rem). Inutile de coder `text-3xl` dans un `CardTitle`.
- **Mobile / PWA** : l'échelle typographique et le format compact sont centralisés en fin de `src/index.css` (blocs « Mobile / PWA »). Hauteur unique des contrôles : `--mobile-control-h` (36 px). Ne pas ajouter de tailles mobiles écran par écran ; pas de `backdrop-filter` (bug PWA/WebView).

## Tests

Voir `docs/TESTS-REGRESSION.md`. Avant de rendre un changement : `npm run verify:baseline`, puis les tests d'interface concernés (`npx playwright test --config playwright.local.config.ts tests/<n>-*`). Nouvel espace ou nouveau menu : il est parcouru par `tests/33-connected-spaces.spec.ts`. Les tests qui écrivent ne visent jamais la base du `.env`.

## Git / artefacts

- Travailler sur une branche dédiée ; ne committer/pusher que sur demande explicite.
- `dist/` est un artefact de build (généré par Vercel) — ne doit pas être suivi par git.
