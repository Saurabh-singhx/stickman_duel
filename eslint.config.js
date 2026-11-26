import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'screenshots'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['pixi.js', 'peerjs', '../render/*', '../audio/*', '../ui/*', '../net/*', '../input/*', '../ai/*', '../modes/*', '../systems/*', '../debug/*', '../replay/*'],
              message: 'src/sim must remain pure and only import from src/sim or src/data.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/sim must not access DOM globals.' },
        { name: 'document', message: 'src/sim must not access DOM globals.' },
        { name: 'Date', message: 'src/sim must not use Date.' },
        { name: 'performance', message: 'src/sim must not use performance.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'src/sim must use seeded Rng instead of Math.random.',
        },
      ],
    },
  },
);
