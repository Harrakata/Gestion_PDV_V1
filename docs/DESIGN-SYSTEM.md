# Design system GestionPDV

Ce document est la source de vérité visuelle et ergonomique de l'application.
Le design system se construit progressivement : les composants existants restent
compatibles, tandis que tout nouvel écran doit utiliser les tokens et composants
sémantiques décrits ici.

## Principes

1. **La tâche avant la décoration** : l'action principale et l'état du dossier
   doivent être identifiables en quelques secondes.
2. **Une signification stable** : une couleur porte le même sens dans tous les
   espaces et n'est jamais l'unique moyen de transmettre une information.
3. **Terrain d'abord** : les actions fréquentes restent utilisables au tactile,
   hors ligne et sur un écran étroit.
4. **Divulgation progressive** : afficher d'abord la décision et permettre
   d'ouvrir le détail à la demande.
5. **Accessible par défaut** : libellés visibles, focus clavier, contraste,
   messages explicites et réduction de mouvement.

## Langage visuel simplifié

- Les surfaces sont neutres par défaut ; la couleur exprime une action, un
  statut ou une alerte, pas la structure de chaque carte.
- Un écran utilise au maximum trois niveaux d'élévation : page, carte et fenêtre
  flottante.
- Les dégradés, halos et rails colorés ne font pas partie des composants
  standards. Ils nécessitent une justification métier explicite.
- Une zone ne possède qu'une action principale visuellement dominante.
- Les onglets actifs utilisent une surface claire et un texte de marque plutôt
  qu'un bloc coloré plein.
- Les barres d'onglets utilisent `bg-card` : fond blanc en thème clair, adapté
  au thème sombre, sans fond teinté ni transparent.
- Les animations sont courtes et fonctionnelles ; elles n'agrandissent pas les
  contrôles au survol.

## Tokens

Les variables sont déclarées dans `src/index.css` et exposées dans
`tailwind.config.js`. Ne pas introduire une nouvelle couleur directe lorsqu'un
rôle sémantique existe.

| Rôle | Classes principales | Usage |
|---|---|---|
| Marque | `primary`, `secondary`, `accent` | Navigation et action principale |
| Succès | `success`, `success-muted` | Validé, résolu, synchronisé |
| Attention | `warning`, `warning-muted` | Échéance proche, attente, surveillance |
| Danger | `destructive` | Blocage, refus, retard critique |
| Information | `info`, `info-muted` | En cours, assigné, information neutre |
| Neutre | `muted`, `surface-subtle` | Archivé, inactif, arrière-plan secondaire |
| Surfaces | `surface`, `surface-subtle`, `surface-elevated` | Conteneurs et panneaux |

Ombres disponibles : `shadow-soft`, `shadow-elevated`, `shadow-floating`.

### Règles de couleur

- Ne pas utiliser `green-*`, `red-*`, `amber-*`, `blue-*` dans un nouveau
  composant métier ; utiliser les tokens ci-dessus.
- Ajouter un texte ou une icône au statut : la couleur seule ne suffit pas.
- Le rouge est réservé aux erreurs, dangers et actions destructrices.
- Les graphiques peuvent utiliser une palette plus large, mais leurs légendes
  doivent rester explicites et cohérentes entre les écrans.

## Typographie

- Titre de page : `text-2xl sm:text-3xl font-bold tracking-tight`.
- Titre de section : `text-lg font-semibold`.
- Corps : `text-sm` ou `text-base`, avec `leading-6` pour les descriptions.
- Métadonnée : `text-xs text-muted-foreground`.
- Ne pas descendre sous `text-xs` pour une information nécessaire à la tâche.
- Les majuscules servent uniquement aux libellés courts, avec un espacement de
  lettres modéré.

## Espacement et surfaces

- Espacement de base : multiples de 4 px.
- Entre sections majeures : 24 à 32 px.
- Dans une carte : 16 px sur mobile, 24 px lorsque le contenu le nécessite.
- Rayon standard : `rounded-xl` ou `rounded-2xl` pour les conteneurs.
- Une seule ombre dominante par niveau de surface.
- Éviter d'imbriquer plus de deux cartes visuelles.

## Composants fondamentaux

### Navigation

La navigation repose sur le menu principal, les menus des espaces et les onglets.
Le fil d'Ariane et les menus de recherche globale ont été retirés, avec leur
raccourci `Ctrl+K`. Les recherches propres aux listes métier restent disponibles.

- Le menu principal présente uniquement les destinations de premier niveau.
- L'élément actif doit être identifiable par le texte et la forme, pas uniquement
  par la couleur.
- Toute nouvelle destination de premier niveau doit être ajoutée au catalogue du
  `Layout`. Les titres des pages sont définis dans `navigationConfig.js`.
- Le lien d'évitement « Aller au contenu principal » doit rester la première
  cible clavier de la page.

### En-tête de page

```jsx
import PageHeader from '@/components/ui/page-header';

<PageHeader
  eyebrow="Maintenance"
  title="Interventions à traiter"
  description="Priorisez les terminaux selon le risque et le délai attendu."
  actions={<Button>Planifier</Button>}
/>
```

### Statut

```jsx
import StatusBadge from '@/components/ui/status-badge';

<StatusBadge status="En cours" />
<StatusBadge tone="danger">SLA dépassé</StatusBadge>
```

`StatusBadge` accepte encore les anciens tons `emerald`, `blue`, `amber` et
`red`, mais les nouveaux développements doivent utiliser `success`, `info`,
`warning` et `danger`.

### Message contextuel

```jsx
import FeedbackPanel from '@/components/ui/feedback-panel';

<FeedbackPanel
  tone="warning"
  title="Synchronisation en attente"
  description="La saisie est conservée sur cet appareil et sera envoyée au retour du réseau."
/>
```

### État vide

```jsx
import EmptyState from '@/components/ui/empty-state';

<EmptyState
  title="Aucun ticket ouvert"
  description="Les nouveaux incidents apparaîtront ici."
  action={<Button>Déclarer un incident</Button>}
/>
```

### Champ de formulaire

```jsx
import FormField from '@/components/ui/form-field';

<FormField
  label="Référence du terminal"
  hint="Scannez le QR code ou saisissez la référence."
  error={errors.reference}
  required
>
  <Input value={reference} onChange={handleChange} />
</FormField>
```

Le libellé doit rester visible. Le placeholder donne un exemple, il ne remplace
pas le libellé.

### Mot de passe et actions de formulaire

```jsx
import PasswordInput from '@/components/ui/password-input';
import FormActions from '@/components/ui/form-actions';

<FormField label="Mot de passe" required error={errors.password}>
  <PasswordInput autoComplete="current-password" />
</FormField>

<FormActions>
  <Button variant="outline">Annuler</Button>
  <Button type="submit">Enregistrer</Button>
</FormActions>
```

- Les erreurs de validation attendues sont affichées sous le champ, pas seulement
  dans un toast.
- L'ordre des actions reste « Annuler » puis action principale sur grand écran ;
  la pile mobile place l'action principale à portée de lecture.
- Les groupes complexes utilisent `FormSection` avec un titre explicite.
- La classe `compact-filter-labels` est réservée aux barres de filtres denses ;
  elle ne doit pas être appliquée à un formulaire de saisie.

### Boutons

- `default` : action principale unique dans la zone.
- `secondary` ou `subtle` : action secondaire.
- `outline` : action complémentaire.
- `ghost` : action légère dans une ligne ou un menu.
- `destructive` : suppression ou action irréversible.
- `success` / `warning` : seulement lorsque le sens métier l'exige.
- `size="touch"` et `size="iconTouch"` : actions terrain et navigation mobile.

### Cartes

Les variantes explicites sont `default`, `subtle`, `elevated`, `interactive` et
`glass`. La prop historique `glass` reste supportée pendant la migration.

```jsx
<Card variant="default">...</Card>
<Card variant="interactive" role="link">...</Card>
```

## États d'un écran

Chaque écran alimenté par des données doit prévoir :

1. chargement sans déplacement brutal de mise en page ;
2. contenu nominal ;
3. résultat vide avec explication ;
4. erreur avec possibilité de réessayer ;
5. mode hors ligne et fraîcheur des données ;
6. accès en lecture seule clairement indiqué.

## Responsive et tactile

- Cible tactile recommandée : 44 × 44 px.
- Sur téléphone, les boutons communs mesurent au moins 44 px de haut et les
  contrôles de saisie utilisent une police de 16 px.
- Les fenêtres suivent la hauteur du viewport visuel et restent défilables.
  Les listes flottantes s'ouvrent au-dessus du contrôle si l'espace manque en bas.
- Une liste ouverte au clavier place le focus dans sa recherche ; `Échap` la
  referme et rend le focus au contrôle d'origine.
- Les gestes de navigation et de rafraîchissement ignorent les champs, les
  boutons, les signatures et les zones défilables.
- Les tableaux larges utilisent un défilement explicite ou la classe opt-in
  `responsive-cards` avec des `data-label` sur les cellules.
- Les filtres secondaires passent dans un panneau sur téléphone.
- L'action principale d'un long formulaire reste accessible sans remonter toute
  la page.
- Tester au minimum à 360, 768, 1024 et 1440 px.

## Accessibilité

- Contraste WCAG AA pour le texte et les contrôles.
- Focus clavier visible et ordre de tabulation logique.
- `aria-invalid` et `aria-describedby` pour les erreurs de formulaire.
- Une icône décorative porte `aria-hidden="true"`.
- Respect de `prefers-reduced-motion` ; le socle CSS le gère globalement.
- Toute carte ou graphique doit disposer d'une alternative textuelle utile.
- Ne pas masquer visuellement les libellés nécessaires à la compréhension du
  formulaire.

## Migration des écrans existants

Ordre recommandé :

1. remplacer les badges de couleurs par `StatusBadge` ;
2. remplacer les blocs d'erreur/information par `FeedbackPanel` ;
3. remplacer les écrans vides par `EmptyState` ;
4. utiliser `PageHeader` pour uniformiser titres et actions ;
5. migrer les formulaires sensibles vers `FormField` ;
6. remplacer progressivement les couleurs directes par les tokens sémantiques ;
7. vérifier mode sombre, clavier, mobile et réduction de mouvement.

La migration ne doit pas modifier les règles métier ni les permissions.

### Vérifications réalisées

- Les formulaires Régions, Secteurs, Agences, Techniciens, Guichetières, Chefs
  d'agence et Chefs de secteur utilisent les champs communs, des erreurs
  associées aux contrôles et une soumission au clavier.
- Le formulaire d'équipement de maintenance affiche la validation sous chaque
  champ requis et accepte la soumission au clavier. L'assignation du stock
  défectueux associe le libellé « Technicien » au contrôle de sélection.
- La configuration des terminaux associe ses libellés aux champs de création,
  de modification et de filtrage. Les champs requis affichent leurs erreurs sous
  le contrôle ; les formulaires de création et de modification se soumettent avec
  `Entrée`. Les panneaux et états utilisent les couleurs sémantiques du thème.
- Le suivi de maintenance du chef d'agence et les états partagés de planification
  utilisent les couleurs sémantiques. Les filtres possèdent un libellé associé ;
  l'historique et les fiches sont accessibles au clavier, avec des actions plus
  grandes sur téléphone.
- Les surfaces de maintenance utilisent les tokens de carte, de texte et de
  bordure pour rester lisibles en thème sombre.
- `tests/16-mobile-usability.spec.ts` couvre les tailles 360, 740, 768 et 1440 px,
  les fenêtres, les listes, les onglets, le thème sombre et le défilement tactile
  des tableaux.
- `tests/17-business-forms.spec.ts` vérifie les sept formulaires à 360 et
  1440 px, la validation locale, les affectations, les dates d'indisponibilité
  et les accès en lecture seule, sur données simulées.
- `tests/18-maintenance-forms.spec.ts` vérifie les champs requis, le choix du
  technicien et la soumission clavier d'une configuration de terminal avec des
  données simulées, sans écriture dans la base.
- `tests/19-chef-maintenance-accessibility.spec.ts` vérifie les filtres et
  l'ouverture d'une fiche de maintenance au clavier sur téléphone, avec des
  données simulées.
- Une vérification sur appareils physiques iOS/Android reste à effectuer,
  notamment pour le clavier virtuel et les zones réservées du système.

