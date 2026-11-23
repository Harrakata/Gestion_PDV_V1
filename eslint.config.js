// ESLint — garde-fous du projet (npm run lint).
//
// Philosophie : bloquer (error) ce qui est un BUG certain, signaler (warn) ce qui
// relève de la dette, pour pouvoir activer le lint sans bloquer les livraisons.
//   error : hooks appelés conditionnellement, variables non définies,
//           boîtes natives window.confirm/alert/prompt (→ useConfirm).
//   warn  : dépendances de hooks, variables inutilisées, console.*,
//           couleurs en dur / liserés manuels (→ jetons du thème, Card accent),
//           accès Supabase directs dans les pages (→ services, lot « Structure »).
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// Cohérence visuelle : couleurs d'état / neutres via les jetons du thème
// (destructive, success, warning, info, muted, foreground, border, card) — sinon
// le mode sombre et le branding client ne s'appliquent pas.
// Couvre toutes les palettes Tailwind, les dégradés (from/via/to), les remplissages
// SVG (fill/stroke) et les couleurs arbitraires (`bg-[#0078D4]`).
const PALETTE = 'red|rose|green|emerald|amber|yellow|orange|blue|sky|slate|gray|purple|violet|indigo|cyan|teal|lime|pink|fuchsia|zinc|neutral|stone';
const COLOR_PREFIX = 'text|bg|border(?:-[trblxyse])?|ring(?:-offset)?|from|via|to|fill|stroke|divide|outline|shadow|accent|decoration|placeholder|caret';
const RAW_COLOR = String.raw`/\b(?:${COLOR_PREFIX})-(?:(?:${PALETTE})-\d{2,3}\b|\[#)|\b(?:bg|from|via|to)-white\b/`;
const DESIGN_RULES = [
  {
    selector: `:matches(Literal[value=${RAW_COLOR}], TemplateElement[value.raw=${RAW_COLOR}])`,
    message: 'Couleur en dur : utiliser un jeton du thème (text-destructive, bg-success-muted, text-muted-foreground, bg-card…).',
  },
  {
    selector: "JSXOpeningElement[name.name='Badge'] Literal[value=/(bg|border|text)-(success|warning|info|destructive)/]",
    message: 'Badge coloré à la main : utiliser <StatusBadge tone=…> (statut) ou <Badge variant="success|warning|danger|info|neutral">.',
  },
  {
    selector: "JSXOpeningElement[name.name='Button']:has(> JSXAttribute[name.name='size'] > Literal[value=/^icon/]):not(:has(> JSXAttribute[name.name=/^(aria-label|aria-labelledby|title)$/]))",
    message: 'Bouton-icône sans nom accessible : ajouter aria-label.',
  },
  {
    selector: String.raw`Literal[value=/absolute inset-x-0 top-0 h-1\.5 bg-primary/]`,
    message: 'Liseré posé à la main : utiliser <Card variant="accent">.',
  },
];
// Pages : la logique d'accès aux données doit migrer vers des services.
const DATA_ACCESS_RULE = {
  selector: "CallExpression[callee.property.name='from'][callee.object.name=/^(supabase|publicSupabase)$/]",
  message: 'Accès Supabase direct dans une page : déplacer la requête dans un service (src/lib ou src/services).',
};

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'supabase/functions/**', 'tests/**', 'playwright-report/**', 'test-results/**', 'scripts/**'] },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'react/prop-types': 'off',            // projet en JS sans PropTypes
      'react/no-unescaped-entities': 'off', // apostrophes françaises dans le JSX
      'react/display-name': 'off',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // NB : une config plus spécifique REMPLACE la règle (pas de fusion) → les
      // pages reprennent DESIGN_RULES + DATA_ACCESS_RULE ci-dessous.
      'no-restricted-syntax': ['warn', ...DESIGN_RULES],
      'no-restricted-properties': ['error',
        { object: 'window', property: 'confirm', message: 'Utiliser useConfirm().confirm (ConfirmDialogProvider).' },
        { object: 'window', property: 'prompt', message: 'Utiliser useConfirm().prompt (ConfirmDialogProvider).' },
        { object: 'window', property: 'alert', message: 'Utiliser un toast.' },
      ],
    },
  },
  {
    files: ['src/pages/**/*.{js,jsx}'],
    rules: { 'no-restricted-syntax': ['warn', ...DESIGN_RULES, DATA_ACCESS_RULE] },
  },
  // Exceptions légitimes.
  {
    files: ['src/components/ConfirmDialogProvider.jsx'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['src/components/ui/card.jsx'], // la variante « accent » dessine le liseré
    rules: { 'no-restricted-syntax': 'off' },
  },
];
