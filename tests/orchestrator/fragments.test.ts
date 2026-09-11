import { describe, it, expect } from 'vitest'
import { parseOwnedPaths } from '../../orchestrator/src/fragments.js'

const IOS = `
## Your Domain

**Owned paths:**
- \`apps/ios/\` — SwiftUI app (Sources/, Tests/, Package.swift)
- \`.github/workflows/ios*.yml\` — iOS CI workflows

**Tech stack:**
- SwiftUI, SPM
`

const DESKTOP = `
**Owned paths:**
- \`apps/desktop/\` — Tauri shell
- \`src/client/\` — React SPA

**Does NOT own:**
- \`tests/features/\` — backend-supervisor owns these
- \`tests/steps/\` — backend-supervisor owns these
`

describe('parseOwnedPaths', () => {
  it('extracts backticked paths from the Owned paths bullets', () => {
    expect(parseOwnedPaths(IOS).owned).toEqual(['apps/ios/', '.github/workflows/ios*.yml'])
  })

  it('stops at the next bold heading', () => {
    expect(parseOwnedPaths(IOS).owned).not.toContain('SwiftUI')
  })

  it('extracts the does-NOT-own list separately', () => {
    const r = parseOwnedPaths(DESKTOP)
    expect(r.owned).toEqual(['apps/desktop/', 'src/client/'])
    expect(r.notOwned).toEqual(['tests/features/', 'tests/steps/'])
  })

  it('returns empty lists rather than throwing on a fragment with no sections', () => {
    expect(parseOwnedPaths('# nothing here')).toEqual({ owned: [], notOwned: [] })
  })
})
