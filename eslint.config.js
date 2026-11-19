// ESLint — garde-fous du projet (npm run lint).
//
// Philosophie : bloquer (error) ce qui est un BUG certain, signaler (warn) ce qui
// relève de la dette, pour pouvoir activer le lint sans bloquer les livraisons.
//   error : hooks appelés conditionnellement, variables non définies,
//           boîtes natives window.confirm/alert/prompt (→ useConfirm).
//   warn  : dépendances de hooks, variables inutilisées, console.*,
//           accès Supabase directs dans les pages (→ services, lot « Structure »).
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

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

      'no-restricted-properties': ['error',
        { object: 'window', property: 'confirm', message: 'Utiliser useConfirm().confirm (ConfirmDialogProvider).' },
        { object: 'window', property: 'prompt', message: 'Utiliser useConfirm().prompt (ConfirmDialogProvider).' },
        { object: 'window', property: 'alert', message: 'Utiliser un toast.' },
      ],
    },
  },
  // Pages : la logique d'accès aux données doit migrer vers des services (src/lib, src/services).
  {
    files: ['src/pages/**/*.{js,jsx}'],
    rules: {
      'no-restricted-syntax': ['warn', {
        selector: "CallExpression[callee.property.name='from'][callee.object.name=/^(supabase|publicSupabase)$/]",
        message: "Accès Supabase direct dans une page : déplacer la requête dans un service (src/lib ou src/services).",
      }],
    },
  },
  // Le repli natif est légitime ici (hors fournisseur).
  {
    files: ['src/components/ConfirmDialogProvider.jsx'],
    rules: { 'no-restricted-properties': 'off' },
  },
];
