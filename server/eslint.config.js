const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');

// Two languages live here on purpose. Application code under src/ and the
// tests are TypeScript; migrations, seeders and the sequelize-cli config stay
// JavaScript because sequelize-cli loads them itself and cannot execute .ts.
// Both need a block — a config that only globs one silently lints nothing in
// the other and passes vacuously in CI.
module.exports = [
  { ignores: ['node_modules', 'coverage', 'dist', 'uploads'] },

  // TypeScript: application code and tests.
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts', 'tests/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // A leading underscore marks a value taken out on purpose, as in
      // `const { passwordHash: _h, ...safe } = row`; the rest is what is used.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Express recognises an error handler by its four-argument arity, so the
      // unused `next` is load-bearing rather than dead.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // JavaScript: migrations, seeders, sequelize-cli config, and whatever under
  // src/ has not been converted yet.
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
