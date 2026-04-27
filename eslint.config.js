// Flat config (ESLint >= 9). Targets the React app under src/ only; Tailwind
// config and other root-level scripts are excluded so they don't flood the
// log with "process is undefined" noise.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/',
      'node_modules/',
      'supabase/',
      '.vercel/',
      'public/',
      '*.cjs',
      '*.config.js',
      '*.config.cjs',
      'AUDIT/',
      'docs/',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // We're not on the new JSX runtime explicitly enforced; React is in scope automatically with Vite's plugin-react.
      'react/react-in-jsx-scope': 'off',
      // PropTypes are noisy and add ~0 value to a small project that's
      // headed for a TypeScript migration anyway.
      'react/prop-types': 'off',
      // Unused vars: warn (not error) so we can clean over time without
      // blocking unrelated PRs. Argument prefix `_` is the escape hatch.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The hooks deps rule is noisy on intentional patterns — keep it
      // as warn during migration; we'll promote to error after a cleanup pass.
      'react-hooks/exhaustive-deps': 'warn',
      // The newer set-state-in-effect rule fires on intentional patterns we
      // use today (RouteSync re-fetching on focus, profile refresh on auth
      // change). Keep it as warn during cleanup; promote to error once we've
      // refactored those into proper data-fetching hooks in FASE D.
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `no-empty` triggers on `catch (_) {}` we use to swallow non-fatal
      // errors (storage unavailable, etc.). Allow that pattern, error on
      // empty blocks elsewhere.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
