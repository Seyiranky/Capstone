module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000,

  // Type errors are caught by `npm run typecheck`, which checks the whole
  // program once. Re-checking it inside every Jest worker would cost real time
  // and find nothing new, and these tests are Postgres-bound rather than
  // transform-bound, so diagnostics stay off here on purpose.
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },

  // .ts must be resolvable for `require('../../src/models')` to find index.ts
  // while the tests themselves are still JavaScript.
  moduleFileExtensions: ['js', 'ts', 'json', 'node'],
};
