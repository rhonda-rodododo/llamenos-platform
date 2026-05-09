#!/usr/bin/env node
import { glob } from 'glob'
import { readFile } from 'fs/promises'

const UI_GLOB = 'src/client/**/*.{tsx,ts}'
const TEST_IDS_FILE = 'tests/test-ids.ts'

async function extractUiTestIds(): Promise<Set<string>> {
  const files = await glob(UI_GLOB)
  const ids = new Set<string>()
  const dataTestIdRegex = /data-testid=["']([^"']+)["']/g
  const templateRegex = /data-testid=\{[`"']([^`"']+)[`"']\}/g

  for (const file of files) {
    const content = await readFile(file, 'utf-8')
    let match
    while ((match = dataTestIdRegex.exec(content)) !== null) {
      ids.add(match[1])
    }
    while ((match = templateRegex.exec(content)) !== null) {
      ids.add(match[1])
    }
  }

  return ids
}

async function extractTestIdConstants(): Promise<Set<string>> {
  const content = await readFile(TEST_IDS_FILE, 'utf-8')
  const ids = new Set<string>()
  const regex = /[A-Z_]+:\s*['"]([^'"]+)['"]/g
  let match
  while ((match = regex.exec(content)) !== null) {
    ids.add(match[1])
  }
  return ids
}

async function main() {
  const [uiTestIds, testIdConstants] = await Promise.all([
    extractUiTestIds(),
    extractTestIdConstants(),
  ])

  const stale: string[] = []
  const missing: string[] = []

  for (const id of testIdConstants) {
    if (!uiTestIds.has(id)) {
      stale.push(id)
    }
  }

  for (const id of uiTestIds) {
    if (!testIdConstants.has(id)) {
      missing.push(id)
    }
  }

  let hasErrors = false

  if (stale.length > 0) {
    console.error(`\n❌ Stale test IDs (${stale.length}): in ${TEST_IDS_FILE} but not in UI`)
    for (const id of stale.sort()) {
      console.error(`   - ${id}`)
    }
    hasErrors = true
  }

  if (missing.length > 0) {
    console.error(`\n⚠️  Missing test IDs (${missing.length}): in UI but not in ${TEST_IDS_FILE}`)
    for (const id of missing.sort()) {
      console.error(`   - ${id}`)
    }
    hasErrors = true
  }

  if (!hasErrors) {
    console.log(`\n✅ All test IDs are valid (${testIdConstants.size} constants, ${uiTestIds.size} UI attributes)`)
    process.exit(0)
  } else {
    console.error(`\nFix: Remove stale IDs from ${TEST_IDS_FILE} or add missing IDs to UI/tests.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Validation failed:', err)
  process.exit(1)
})
