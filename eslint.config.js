import tseslint from 'typescript-eslint'
import noInlineApiShape from './scripts/eslint-rules/no-inline-api-shape.js'

export default tseslint.config(
  { ignores: ['dist/', '.features-gen/', 'packages/protocol/generated/'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // Test files use partial mocks that require 'any' casts — relax the rule.
  // Globs cover every place tests live: unit tests colocated with source,
  // BDD step definitions + helpers under tests/, cross-platform specs under
  // packages/test-specs/, and desktop WebdriverIO specs (*.wdio.ts).
  {
    files: [
      '**/__tests__/**/*.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/*.wdio.ts',
      'tests/**/*.ts',
      'packages/test-specs/**/*.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
  // Desktop lane (#703) takes the `any` ban back for its own trees: src/client's
  // colocated tests and everything under tests/ except tests/steps/backend/, which
  // is the backend lane (#702, still open) and stays exempt via the block above.
  // Every other tests/steps/ subtree is desktop Playwright step code. The shared
  // lane's packages/test-specs/ stays exempt too (#704).
  {
    files: [
      'src/client/**/__tests__/**/*.ts',
      'src/client/**/*.test.ts',
      'src/client/**/*.spec.ts',
      'tests/**/*.ts',
    ],
    ignores: ['tests/steps/backend/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // api-schema-binding rail (see scripts/api-schema-binding/): a hand-written request/response
  // shape here is a build error, so the client/server drift documented in
  // scripts/api-schema-binding/report.md cannot keep spreading by copy-paste from a neighbour.
  {
    files: ['src/client/lib/api/**/*.ts'],
    plugins: { local: { rules: { 'no-inline-api-shape': noInlineApiShape } } },
    rules: {
      'local/no-inline-api-shape': 'error',
    },
  },
  // Pre-existing debt from before this rule existed (see report.md for the full inventory).
  // Downgraded to `warn` — not disabled — so `bun run lint` stays informative on these two
  // files without blocking unrelated PRs on a cleanup that isn't theirs to do. #874 owns the
  // rest of the api/ split; tracked for follow-up alongside it rather than fixed here.
  {
    files: ['src/client/lib/api/hub-onboard.ts', 'src/client/lib/api/provider-setup.ts'],
    rules: {
      'local/no-inline-api-shape': 'warn',
    },
  },
)
