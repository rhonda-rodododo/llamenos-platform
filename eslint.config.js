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
  // Domain-separation rail (#1033): crypto contexts come from the generated registry
  // (@shared/crypto-labels), never a raw 'llamenos:*' literal — a literal drifts silently when
  // packages/protocol/crypto-labels.json changes. version.ts (DOM event name) and
  // transcription (localStorage key) are not crypto contexts.
  {
    files: ['src/client/lib/**/*.ts'],
    ignores: [
      'src/client/lib/**/*.test.ts',
      'src/client/lib/version.ts',
      'src/client/lib/transcription/**',
    ],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "Literal[value=/^llamenos:/]",
        message: "Use the generated constant from '@shared/crypto-labels' instead of a raw 'llamenos:' literal.",
      }],
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
  // Downgraded to `warn` — not disabled — so `bun run lint` stays informative on these files
  // without blocking unrelated PRs on a cleanup that isn't theirs to do.
  //
  // This list was originally just `hub-onboard.ts`/`provider-setup.ts` — the only two
  // domain modules that existed when this rail was authored. #874 (splitting api.ts into
  // per-domain modules) landed independently and finished the split before this PR did,
  // carrying every hand-written shape over unchanged into ~40 new files. Rebasing this PR
  // onto that state turned "two known exceptions" into "38 of 40 files in the directory",
  // which is `report.md`'s own UNBOUND/MISMATCHED count, not a new problem — regenerate the
  // report and re-narrow this list file-by-file as each one is migrated to a protocol type;
  // do not add new files here going forward, since new code should bind from the start.
  {
    files: [
      'src/client/lib/api/audit.ts',
      'src/client/lib/api/auth.ts',
      'src/client/lib/api/bans.ts',
      'src/client/lib/api/blasts.ts',
      'src/client/lib/api/call-settings.ts',
      'src/client/lib/api/calls.ts',
      'src/client/lib/api/client.ts',
      'src/client/lib/api/cms-report-types.ts',
      'src/client/lib/api/cms.ts',
      'src/client/lib/api/contacts.ts',
      'src/client/lib/api/conversations.ts',
      'src/client/lib/api/directory.ts',
      'src/client/lib/api/evidence.ts',
      'src/client/lib/api/files.ts',
      'src/client/lib/api/firehose.ts',
      'src/client/lib/api/governance.ts',
      'src/client/lib/api/hub-onboard.ts',
      'src/client/lib/api/hubs.ts',
      'src/client/lib/api/interactions.ts',
      'src/client/lib/api/invites.ts',
      'src/client/lib/api/ivr-audio.ts',
      'src/client/lib/api/messaging-config.ts',
      'src/client/lib/api/migrations.ts',
      'src/client/lib/api/notes.ts',
      'src/client/lib/api/provider-setup.ts',
      'src/client/lib/api/records.ts',
      'src/client/lib/api/recovery.ts',
      'src/client/lib/api/reports.ts',
      'src/client/lib/api/ring-groups.ts',
      'src/client/lib/api/roles.ts',
      'src/client/lib/api/setup.ts',
      'src/client/lib/api/shifts.ts',
      'src/client/lib/api/signal.ts',
      'src/client/lib/api/tags.ts',
      'src/client/lib/api/teams.ts',
      'src/client/lib/api/telephony.ts',
      'src/client/lib/api/triage.ts',
      'src/client/lib/api/users.ts',
    ],
    rules: {
      'local/no-inline-api-shape': 'warn',
    },
  },
)
