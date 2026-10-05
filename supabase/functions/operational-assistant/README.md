# Assistant opérationnel

Assistant flottant accessible dans le Layout de l'application. Deux modes distincts :

- **Guide intégré** : documentation métier locale, disponible hors ligne et sans clé IA. Aucune consultation des données actuelles.
- **IA** : conversation OpenAI Responses, recherche dans le guide et outils de lecture des agences, des terminaux maintenance et des terminaux Mobi.

## Fonctions de base

L'onglet **Fiches pratiques** contient 26 rubriques réparties en cinq thèmes : premiers pas, agences et personnel, terminaux et maintenance, caisse et objectifs, suivi quotidien. Il propose une recherche sans distinction d'accents, un filtre par thème et des procédures numérotées pour les opérations courantes.

Les six raccourcis de la conversation privilégient le module ouvert. Choisir une fiche, un raccourci ou **Reprendre dans la conversation** utilise uniquement le guide local, même si l'IA est activée : aucun appel au fournisseur et aucun quota consommé. Ces procédures expliquent les actions ; elles ne les exécutent pas. Les liens vers les menus restent limités aux accès confirmés par le serveur et ne sont pas proposés lorsque les droits n'ont pas pu être vérifiés.

## Mise en service

1. Appliquer `supabase/migrations/add_operational_assistant.sql` sur le projet du client. La migration est aussi inscrite au manifest du script multi-client.
2. Dans les secrets Supabase Edge Functions, configurer `OPENAI_API_KEY` et `OPENAI_MODEL` (identifiant d'un modèle de votre projet compatible avec Responses et les outils function calling). Ne jamais préfixer ces secrets par `VITE_`, les placer dans `app_settings`, les saisir dans la conversation ou les committer. `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis par Supabase.
3. Déployer depuis la racine du dépôt :

```sh
supabase functions deploy operational-assistant
```

4. Ouvrir un espace avec un compte Auth lié à une fiche métier active. L'assistant affiche **IA · Consultation en lecture seule** lorsque le serveur et les secrets sont disponibles. Le quota doit être installé pour envoyer une question.

Les comptes de bootstrap sans profil métier lié restent sur le guide. Ne pas ajouter de contournement administrateur fondé sur le navigateur.

## Configuration

| Variable | Emplacement | Effet |
| --- | --- | --- |
| `VITE_ASSISTANT_ENABLED=false` | Déploiement frontend | Masque le bouton flottant |
| `ASSISTANT_ENABLED=false` | Secrets Edge Function | Désactive le service IA |
| `ASSISTANT_DISABLED_FEATURES` | Secrets Edge Function | Liste de fonctionnalités désactivées, séparées par des virgules |
| `ASSISTANT_SECTEUR_ENABLED=false` | Secrets Edge Function | Désactive le niveau secteur dans l'assistant |

Si le déploiement utilise `VITE_FEATURES_DISABLED` ou `VITE_HIERARCHY_SECTEUR=off`, reproduire ces restrictions avec les deux variables serveur correspondantes. Les restrictions stockées en base sont lues à chaque demande. Ne jamais configurer une clé secrète côté frontend.

## Accès et données

Le serveur vérifie le JWT, retrouve le profil par `auth_user_id`, puis lit les droits et fonctionnalités. L'identité, les permissions et le périmètre envoyés par le navigateur ou le modèle ne font pas autorité. La clé service est utilisée uniquement pour lire les métadonnées de droits ; les données opérationnelles sont interrogées avec le JWT de l'utilisateur, sous RLS, et avec un filtre explicite d'agence, secteur ou région lorsque le profil est limité.

Le modèle ne reçoit pas d'outil d'écriture ni de SQL libre. Seuls des champs métier sélectionnés sont consultés : aucun mot de passe, IP, IMEI, téléphone, salaire individuel ou pièce jointe. Les terminal states indiquent les statuts enregistrés et le suivi existant, pas une télémétrie en direct. Les fiches d'agence courantes ne prouvent pas leur ouverture réelle. Les terminaux sans rattachement ne sont pas inclus.

Les recherches sont bornées (20 résultats par outil, snapshots de 1 000 lignes, cinq appels d'outils maximum, quatre tours modèle). Les réponses signalent les extraits incomplets ; l'absence dans un extrait ne prouve pas l'absence dans toute la base. Les sources de données affichent l'heure de consultation.

Le quota est atomique et commun aux instances : 20 questions par utilisateur et par fenêtre de dix minutes. La table de quota contient uniquement l'identifiant utilisateur et des compteurs. Une migration absente bloque les appels payants.

Les conversations restent en mémoire du navigateur et sont effacées au changement de compte ou d'espace. L'application ne les journalise pas. Les questions, extraits de conversation et données autorisées utiles sont envoyés à OpenAI. Les appels utilisent `store: false` ; cela ne constitue pas une garantie de rétention nulle chez le fournisseur. Voir les paramètres et politiques de votre projet OpenAI.

## Vérifications

```sh
node tests/operationalAssistant.unit.mjs
npx playwright test tests/13-operational-assistant.spec.ts --reporter=list
npm run build
```

Les tests locaux utilisent des données fictives et un fournisseur simulé. Après déploiement, vérifier avec des comptes Exploitation, Chef d'agence et Directeur régional : aide sur un menu, état d'un terminal autorisé, demande hors périmètre, sous-onglet désactivé, quota, déconnexion et hors ligne.

La base d'aide commune est `supabase/functions/_shared/assistantKnowledge.js`. Mettre ses règles à jour en même temps que les fonctionnalités concernées.

Références : [Responses et génération de texte](https://developers.openai.com/api/docs/guides/text), [outils function calling](https://developers.openai.com/api/docs/guides/function-calling).
