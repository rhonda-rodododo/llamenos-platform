/**
 * Rail for the bug #936 fixes: this repo runs two test runners, and they do
 * not mix.
 *
 * Playwright collects `**\/*.spec.ts` under `tests/` and executes them on
 * Node. Bun tests live alongside them and `import { test } from "bun:test"`.
 * Neither runtime can host the other's files:
 *
 *   - under Node, `bun:test` fails to resolve at all —
 *     "Only URLs with a scheme in: file, data, and node are supported by the
 *      default ESM loader. Received protocol 'bun:'"
 *   - under Bun, it resolves but is inert —
 *     "Cannot use describe outside of the test runner. Run `bun test`"
 *
 * Either way the failure lands at LOAD time and takes the whole run with it,
 * before a single spec executes. It then reports as "E2E (Linux) failed" with
 * nothing pointing at the offending file, which is why the real cause took
 * several cycles to find.
 *
 * `testMatch` in playwright.config.ts is the fix; this is the guard that keeps
 * it true. Without it the boundary is a naming convention, and the next Bun
 * test added under tests/ silently breaks the suite again.
 */
import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const TESTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)))

function specFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.features-gen') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) specFiles(full, found)
    else if (entry.endsWith('.spec.ts')) found.push(full)
  }
  return found
}

test.describe('test runner boundary', () => {
  test('no Playwright spec imports a bun: module', () => {
    const offenders: string[] = []
    const selfPath = fileURLToPath(import.meta.url)
    for (const file of specFiles(TESTS_DIR)) {
      // This file documents the forbidden pattern in prose; skip it so the
      // guard does not flag its own explanation.
      if (file === selfPath) continue
      const src = readFileSync(file, 'utf-8')
      if (/from\s+['"]bun:[a-z]+['"]|require\(\s*['"]bun:[a-z]+['"]\s*\)/.test(src)) {
        offenders.push(relative(TESTS_DIR, file))
      }
    }

    expect(
      offenders.length === 0,
      `These files are collected by Playwright (they end in .spec.ts) but import a ` +
        `bun: module, which Playwright cannot execute:\n  ${offenders.join('\n  ')}\n\n` +
        `A bun: import in a Playwright-collected file fails at LOAD time and aborts ` +
        `the entire run before any spec executes — see #936.\n\n` +
        `Fix: a Bun test belongs in a file NOT matching **/*.spec.ts (use .test.ts), ` +
        `so Playwright leaves it to \`bun test\`. Do not add it to testIgnore — the ` +
        `suffix is what separates the two runners.`,
    ).toBe(true)
  })
})
