import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'server/data/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: [
      'server/**/*.js',
      'scripts/**/*.{js,mjs}',
      'e2e/**/*.mjs',
      'eslint.config.js',
      'client/vite.config.js',
      'client/test/**/*.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // This project is plain JavaScript; props are documented by usage, not PropTypes.
      'react/prop-types': 'off',
    },
  },
  {
    // The service worker runs in a worker scope, not a window.
    files: ['client/public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Command-line tools print their results.
    files: ['scripts/**/*.{js,mjs}', 'e2e/**/*.mjs', 'server/src/db/seed-cli.js'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
