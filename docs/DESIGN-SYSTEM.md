# Design system GPDV

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
  standards, hors liseré de `Card variant="accent"`. Ils nécessitent une justification métier explicite.
- Une zone ne possède qu'une action principale visuellement dominante.
- L'onglet actif est plein : `bg-primary` avec `text-primary-foreground`, fourni par
  `TabsTrigger`. Ne pas le restyler écran par écran.
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
| Distinction | `highlight`, `highlight-muted` | Valeur calculée, niveau national, projection (sans jugement) |
| Neutre | `muted`, `surface-subtle` | Archivé, inactif, arrière-plan secondaire |
| Surfaces | `surface`, `surface-subtle`, `surface-elevated` | Conteneurs et panneaux |

Ombres disponibles : `shadow-soft`, `shadow-elevated`, `shadow-floating`.

### Personnalisation par client

Paramètres → « Personnalisation » (`src/lib/theme.js`) et « Personnalisation App
Mobile » (`src/lib/mobileCustomization.js`).

- Une option = une entrée dans les valeurs par défaut, une liste de choix, sa
  normalisation (`normalizeTheme` / `normalizeMobile`), et un rendu par variable CSS
  ou attribut `data-*` sur `<html>` (fin d'`index.css`). La valeur par défaut ne
  change rien à l'affichage.
- Un changement est un aperçu (`persist: false`) ; seul « Enregistrer » écrit en base
  et dans le cache. Les réglages se transfèrent d'un client à l'autre par
  Exporter / Importer.
- Fond de page : `var(--page-background)` et `var(--page-pattern)`. Arrondis : une
  seule source, `--radius` (« Arrondi des coins », PC et téléphone). `rounded-*` en
  dérive ; `rounded-surface` (barres, menus, fenêtres) et `rounded-pill` (badges,
  puces, boutons ronds) aussi. `rounded-full` est réservé à ce qui est rond par nature
  (photo, point, jauge, interrupteur). Jamais de rayon fixe en CSS. Hauteur mobile : `--mobile-control-h`
  (36, 40 ou 44 px selon le client).
- `tests/24-customization.spec.ts` vérifie que chaque option change l'affichage.

### Règles de couleur

- Ne pas utiliser de palette Tailwind (`green-*`, `violet-*`…), de dégradé coloré
  (`from-*`, `to-*`) ni de couleur arbitraire (`bg-[#…]`) dans un composant métier ;
  utiliser les tokens ci-dessus. ESLint les signale toutes.
- Sur un fond plein, utiliser le texte associé (`bg-success text-success-foreground`),
  jamais `text-white` : il devient illisible en thème sombre.
- Texte d'alerte : `text-warning-muted-foreground` (`warning` seul est trop pâle).
- Les jetons de marque sont dérivés de la couleur du client par
  `src/lib/themeContrast.js`, qui garantit un contraste AA en clair et en sombre.
- Ajouter un texte ou une icône au statut : la couleur seule ne suffit pas.
- Le rouge est réservé aux erreurs, dangers et actions destructrices.
- Une zone de signature (et son aperçu) reste blanche, y compris en thème sombre.
- Les graphiques peuvent utiliser une palette plus large, mais leurs légendes
  doivent rester explicites et cohérentes entre les écrans.

## Typographie

- Titre de page : `text-2xl sm:text-3xl font-bold tracking-tight`.
- Titre de section : `text-lg font-semibold`.
- Corps : `text-sm` ou `text-base`, avec `leading-6` pour les descriptions.
- Métadonnée : `text-xs text-muted-foreground`.
- Ne pas descendre sous `text-xs`. Son plancher est de 12 px (`--text-min`), même
  avec la taille « Compacte » et sur téléphone ; ESLint signale `text-[10px]` et
  équivalents. Exceptions : les axes de
  graphiques et les en-têtes de colonnes (majuscules, `--table-head-size` : 11 px sur
  ordinateur, 10 px sur téléphone, style unique en fin d'`index.css`).
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

La navigation publique est gérée par `Layout`. Les espaces connectés utilisent
`SpaceShell` pour la carte latérale, le profil, le tiroir et les onglets mobiles.
Le nom et le logo du client viennent de `useClient` pour tous les espaces.

- Le menu principal présente uniquement les destinations de premier niveau.
- L'élément actif doit être identifiable par le texte et la forme, pas uniquement
  par la couleur.
- Toute nouvelle destination de premier niveau doit être ajoutée au catalogue du
  `Layout`. Les titres des pages sont définis dans `navigationConfig.js`.
- Le lien d'évitement « Aller au contenu principal » doit rester la première
  cible clavier de la page.
- Chaque espace déclare ses destinations dans `menuItems` après avoir appliqué
  ses permissions. Un élément porte `key`, `label`, `icon`, `active`, puis
  `to` pour une route ou `onClick` pour un onglet local. `mobileLabel` et
  `disabled` sont optionnels.
- Le menu, la recherche et les gestes mobiles réutilisent ces destinations.
  Exploitation précise l'ordre de ses raccourcis mobiles et les groupes de recherche.
- Une erreur de rendu d'un écran est contenue dans la zone de contenu. Le menu
  reste utilisable et l'erreur est associée à l'espace et à l'onglet dans le
  suivi d'erreurs, lorsque celui-ci est activé.

### En-tête de page

Les titres principaux utilisent `PageHeader`. Les titres de cartes à
l'intérieur de l'écran utilisent `CardTitle`. Les actions d'en-tête
passent par la prop `actions` pour conserver le même comportement sur mobile.

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

- Les fonctions métier renvoient un **ton**, jamais des classes :
  `<StatusBadge tone={getTicketStatusTone(t.statut)}>`.
- Compteur, catégorie ou badge avec icône : `<Badge variant="success">` (sans pastille).
- ESLint signale tout `Badge` coloré à la main.

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

- `compact` dans une carte ou une liste ; `plain` (sans cadre) dans une cellule de
  tableau. Le titre est un paragraphe : il ne modifie pas le plan de la page.

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

- Une fenêtre dont la barre d'actions (`DialogFooter` ou `FormActions`) contient
  « Annuler » ou « Fermer » n'affiche pas la croix : c'est automatique. Ne placer dans
  cette barre que le bouton qui ferme la fenêtre.
- Les erreurs de validation attendues sont affichées sous le champ, pas seulement
  dans un toast.
- L'ordre des actions reste « Annuler » puis action principale sur grand écran ;
  la pile mobile place l'action principale à portée de lecture.
- Les groupes complexes utilisent `FormSection` avec un titre explicite.
- La classe `compact-filter-labels` est réservée aux barres de filtres denses ;
  elle ne doit pas être appliquée à un formulaire de saisie.

### Photos

- Choisir : `PhotoPicker` (`src/components/photos/`) avec `usePhotoSelection` dans
  l'écran ; l'appareil photo n'est proposé que sur un appareil tactile.
- Enregistrer : `uploadPhotos` (`src/lib/photos.js`) réduit et envoie ; sans réseau, la
  photo attend dans la file hors-ligne. Ne jamais envoyer un fichier d'origine.
- Montrer : `PhotoGallery` (miniatures ou bouton compteur, agrandissement).

### Boutons

- `default` : action principale unique dans la zone.
- `secondary` ou `subtle` : action secondaire.
- `outline` : action complémentaire.
- `ghost` : action légère dans une ligne ou un menu.
- `destructive` : suppression ou action irréversible.
- `success` / `warning` : seulement lorsque le sens métier l'exige.
- `size="touch"` et `size="iconTouch"` : actions et navigation sur ordinateur et
  tablette ; sur téléphone, la hauteur commune de 36 px s'applique.

### Cartes

Les variantes explicites sont `default`, `subtle`, `elevated`, `interactive`,
`accent` (en-tête d'écran, seul liseré autorisé) et `glass`. La prop historique `glass` reste supportée pendant la migration.

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

## Langues

Les textes s'écrivent en français et sont traduits à l'affichage (voir CLAUDE.md, « Langues »). Pour un écran :

- prévoir des libellés qui peuvent s'allonger : ne pas fixer la largeur d'un bouton ou d'un onglet sur son texte français ;
- écrire une phrase entière dans un seul texte ou modèle (`${n} ligne(s) affichée(s)`) plutôt que des morceaux collés ;
- pluriels : préférer `ligne(s)` ou deux libellés complets à un `s` ajouté au mot ;
- ajouter la traduction (`npm run i18n`) dans le même changement.

## Responsive et tactile

- Sur téléphone, tous les contrôles (boutons, onglets, listes, champs, options de
  menu, actions de tableau) mesurent **36 px** de haut par défaut (40 ou 44 px au choix
  du client) : variable unique `--mobile-control-h` d'`index.css`. Ne pas fixer de hauteur écran par écran.
- Le plancher de 36 px est en pixels : il tient aussi avec la taille d'affichage
  « Compacte » des Paramètres. Il augmente avec la taille « Grande ».
- Les champs de saisie passent à 16 px de police sur iOS, pour éviter le zoom.
- Toute page de test doit reproduire `#main-content > .app-space-main` : c'est la
  portée réelle des règles mobiles.
- Les fenêtres suivent la hauteur du viewport visuel et restent défilables.
  Les listes flottantes s'ouvrent au-dessus du contrôle si l'espace manque en bas.
- Une liste ouverte au clavier place le focus dans sa recherche ; `Échap` la
  referme et rend le focus au contrôle d'origine.
- Les gestes de navigation et de rafraîchissement ignorent les champs, les
  boutons, les signatures et les zones défilables.
- Calendriers de planning : `MobilePlanningCalendar` sur téléphone (cases compactes,
  points de couleur, détail du jour dessous, glisser pour changer de période), grille
  complète sur ordinateur. Une
  action ne doit jamais dépendre du seul survol.
- Les tableaux larges utilisent un défilement explicite ou la classe opt-in
  `responsive-cards` avec des `data-label` sur les cellules.
- Les filtres secondaires passent dans un panneau sur téléphone : `MobileFilterBar`
  (`src/components/ui/mobile-filter-bar.jsx`), une ligne « recherche + Filtres » (ou « Filtres » seul) qui
  rappelle, repliée, la période et les filtres actifs. Déclarer les champs une seule
  fois et les partager avec la barre de l'ordinateur.
- L'action principale d'un long formulaire reste accessible sans remonter toute
  la page.
- Tester au minimum à 360, 768, 1024 et 1440 px.

## Accessibilité

- Contraste WCAG AA pour le texte et les contrôles.
- Focus clavier visible et ordre de tabulation logique.
- `aria-invalid` et `aria-describedby` pour les erreurs de formulaire.
- Une icône décorative porte `aria-hidden="true"`.
- Un bouton-icône porte un `aria-label` précis (« Modifier l'agence X »).
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
- `tests/21-mobile-scale.spec.ts` mesure la hauteur des contrôles de douze écrans
  à 360 px, aux trois tailles d'affichage, dans la page et dans une fenêtre.
- `tests/23-big-screens.spec.ts` mesure texte, contraste et débordement de douze
  écrans denses (salaire, tableau de bord, Mobi, planning, réparation…).
- `tests/unit/themeContrast.test.js` vérifie les contrastes des couleurs proposées.
- `tests/20-space-shell.spec.ts` couvre l'alignement de la carte sur
  ordinateur, la navigation du tiroir sur mobile et l'isolation d'une erreur
  de rendu, sur une fixture sans accès aux données client.
- Une vérification sur appareils physiques iOS/Android reste à effectuer,
  notamment pour le clavier virtuel et les zones réservées du système.

