/**
 * no-inline-api-shape.test.ts — audits the api-schema-binding lint rail by breaking it.
 *
 * Per "audit gates by breaking them": this doesn't read eslint.config.js and assert the
 * rule is *configured* — it lints a real fixture containing exactly the anti-pattern the
 * rule exists to catch (a hand-typed request body + response shape, the same pattern that
 * let `createUser`/`listUsers` drift from their protocol schemas — see
 * scripts/api-schema-binding/report.md) and asserts the rule actually fires, naming the
 * file and the rule.
 *
 * The mutation check re-lints the identical fixture with the rule OFF and asserts the
 * violation disappears. A rule module that always reports (or never does) would pass an
 * "assert violations.length > 0" test forever; only the on/off delta proves the rule — not
 * some other rule, not a parse error — is what's catching this.
 */
import { describe, expect, test } from 'bun:test'
import { ESLint } from 'eslint'
import { resolve } from 'node:path'

const CONFIG_FILE = resolve(import.meta.dirname, '../../eslint.config.js')
// A path under the rule's scoped glob (src/client/lib/api/**/*.ts) that need not exist on
// disk — ESLint's flat config matches `files` globs against this filePath alone.
const FIXTURE_PATH = 'src/client/lib/api/__fixtures__/no-inline-api-shape-violation.ts'

const VIOLATION_SOURCE = `
export async function createWidget(data: { name: string; ownerId: string }): Promise<{ id: string; name: string }> {
  return { id: '1', name: data.name }
}
`

const RULE_ID = 'local/no-inline-api-shape'

async function lintFixture(overrideConfig?: Record<string, unknown>) {
  const eslint = new ESLint({
    overrideConfigFile: CONFIG_FILE,
    overrideConfig: overrideConfig as never,
  })
  const [result] = await eslint.lintText(VIOLATION_SOURCE, { filePath: FIXTURE_PATH })
  return result
}

describe('local/no-inline-api-shape (mutation-tested rail)', () => {
  test('CONFIRMED: fires on a hand-written request body + response shape in src/client/lib/api/**', async () => {
    const result = await lintFixture()
    const violations = result.messages.filter(m => m.ruleId === RULE_ID)

    // Names the file and the rule, per the audit-gates-by-breaking convention.
    expect(FIXTURE_PATH).toContain('src/client/lib/api/')
    expect(violations.length).toBeGreaterThanOrEqual(2) // the body param type AND the response type
    for (const v of violations) {
      expect(v.severity).toBe(2) // 'error', not 'warn' — a real build-breaking failure
    }
  })

  test('MUTATION: disabling the rule makes the same violation disappear', async () => {
    const result = await lintFixture({ rules: { [RULE_ID]: 'off' } })
    const violations = result.messages.filter(m => m.ruleId === RULE_ID)
    expect(violations.length).toBe(0)
  })

  test('does not fire on a file outside the rule-scoped api/ directory', async () => {
    const eslint = new ESLint({ overrideConfigFile: CONFIG_FILE })
    const [result] = await eslint.lintText(VIOLATION_SOURCE, { filePath: 'src/client/lib/not-api/whatever.ts' })
    const violations = result.messages.filter(m => m.ruleId === RULE_ID)
    expect(violations.length).toBe(0)
  })
})
