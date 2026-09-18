import { describe, it, expect } from 'vitest'
import {
  isCryptoDiff, requiredAdditionalReviewers, CRYPTO_SECURITY_REVIEWER_AGENT, CRYPTO_REVIEW_PATHS,
} from '../../orchestrator/src/review.js'
import { codeownersMatcher, trackedFiles, trackedFilesUnder } from './codeowners.js'

describe('isCryptoDiff / requiredAdditionalReviewers', () => {
  it('requests the crypto reviewer for a diff touching packages/crypto/', () => {
    expect(isCryptoDiff(['packages/crypto/src/hpke_envelope.rs'])).toBe(true)
    expect(requiredAdditionalReviewers(['packages/crypto/src/hpke_envelope.rs']))
      .toEqual([CRYPTO_SECURITY_REVIEWER_AGENT])
  })
  it('requests the crypto reviewer for a diff touching protocol schemas', () => {
    expect(isCryptoDiff(['packages/protocol/schemas/note.ts'])).toBe(true)
  })
  it('requests the crypto reviewer for a diff touching crypto-labels.json', () => {
    expect(isCryptoDiff(['packages/protocol/crypto-labels.json'])).toBe(true)
  })
  it('requests the crypto reviewer for a diff touching auth/session/sigchain code', () => {
    // Real tracked files, not invented ones: `apps/worker/lib/auth/tokens.ts`
    // and `apps/worker/lib/session/store.ts` — which this test used to assert
    // on — do not exist in this repo and never have.
    expect(isCryptoDiff(['apps/worker/lib/auth.ts'])).toBe(true)
    expect(isCryptoDiff(['apps/worker/lib/session-renewal.ts'])).toBe(true)
    expect(isCryptoDiff(['apps/worker/routes/sigchain.ts'])).toBe(true)
  })
  it('does not request the crypto reviewer for an unrelated diff', () => {
    expect(isCryptoDiff(['apps/worker/routes/notes.ts'])).toBe(false)
    expect(requiredAdditionalReviewers(['apps/worker/routes/notes.ts'])).toEqual([])
  })
  it('never lists the crypto reviewer as a REPLACEMENT for the non-author opinion', () => {
    // requiredAdditionalReviewers only ever names what is requested ON TOP
    // of the mandatory non-author second opinion — it must never return
    // something that could be mistaken for "instead of".
    const extra = requiredAdditionalReviewers(['packages/crypto/src/hpke_envelope.rs'])
    expect(extra).not.toContain('non-author-second-opinion')
    expect(extra).toEqual([CRYPTO_SECURITY_REVIEWER_AGENT])
  })
})

// `mayAutoMerge` is gone. CODEOWNERS is now the only thing that stops a
// crypto diff merging without a human, so this is no longer a belt-and-braces
// assertion — it is THE assertion, against the real tree, with the same
// gitignore semantics GitHub applies.
describe('crypto paths are owned in CODEOWNERS, not only gated in code', () => {
  it('owns every tracked crypto-review file', () => {
    const files = trackedFiles()
    const owner = codeownersMatcher()
    for (const p of CRYPTO_REVIEW_PATHS) {
      const under = trackedFilesUnder(p, files)
      expect(under.length, `CRYPTO_REVIEW_PATHS entry "${p}" matches no tracked file`).toBeGreaterThan(0)
      for (const f of under) expect(owner.owns(f), `${f} has no CODEOWNERS owner`).toBe(true)
    }
  })
})
