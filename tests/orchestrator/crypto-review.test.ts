import { describe, it, expect } from 'vitest'
import {
  isCryptoDiff, requiredAdditionalReviewers, CRYPTO_SECURITY_REVIEWER_AGENT, CRYPTO_REVIEW_PATHS,
} from '../../orchestrator/src/review.js'
import { codeownersMatcher, trackedFiles, trackedFilesUnder } from './codeowners.js'
import { classifyImpact } from '../../orchestrator/src/impact.js'

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

describe('crypto diffs always reach a human — now via CODEOWNERS, not a merge function', () => {
  it('still classifies a packages/crypto/ diff as high impact', () => {
    expect(classifyImpact(['packages/crypto/src/hpke_envelope.rs'], 20).impact).toBe('high')
  })

  // The rail that used to live in `mayAutoMerge` — "an approving reviewer can
  // never be smuggled in as merge permission for a crypto diff" — is now
  // structural rather than conditional: there is no merge function left to
  // pass a verdict to, and GitHub holds the PR because the path is owned in
  // CODEOWNERS. Asserted on the real file so a crypto path silently losing
  // its owner fails here.
  it('owns every tracked crypto-review file in CODEOWNERS, so no verdict of any kind can merge one', () => {
    const files = trackedFiles()
    const owner = codeownersMatcher()
    for (const p of CRYPTO_REVIEW_PATHS) {
      const under = trackedFilesUnder(p, files)
      expect(under.length, `CRYPTO_REVIEW_PATHS entry "${p}" matches no tracked file`).toBeGreaterThan(0)
      for (const f of under) expect(owner.owns(f), `${f} has no CODEOWNERS owner`).toBe(true)
    }
  })
})
