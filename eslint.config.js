import tseslint from 'typescript-eslint'

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
)
