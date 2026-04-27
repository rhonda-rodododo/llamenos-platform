import { describe, it, expect } from 'bun:test'
import { parseStasisArgs, SframeModeDispatcher } from './sframe-mode-dispatcher'

describe('parseStasisArgs', () => {
  it('returns sframe mode when args contain "sframe"', () => {
    expect(parseStasisArgs(['sframe'])).toEqual({ mode: 'sframe' })
  })

  it('returns sframe mode case-insensitively', () => {
    expect(parseStasisArgs(['SFrame'])).toEqual({ mode: 'sframe' })
    expect(parseStasisArgs(['SFRAME'])).toEqual({ mode: 'sframe' })
  })

  it('returns sframe when mixed with other args', () => {
    expect(parseStasisArgs(['dialed', 'sframe', 'extra'])).toEqual({ mode: 'sframe' })
  })

  it('returns pstn mode when args are empty', () => {
    expect(parseStasisArgs([])).toEqual({ mode: 'pstn' })
  })

  it('returns pstn mode when no sframe arg present', () => {
    expect(parseStasisArgs(['dialed', 'parent-123', 'pubkey-abc'])).toEqual({ mode: 'pstn' })
  })
})

describe('SframeModeDispatcher', () => {
  const dispatcher = new SframeModeDispatcher()

  it('allows recording for pstn mode', () => {
    expect(() => dispatcher.assertRecordingAllowed({ mode: 'pstn' })).not.toThrow()
  })

  it('throws for sframe mode', () => {
    expect(() => dispatcher.assertRecordingAllowed({ mode: 'sframe' })).toThrow(
      'recording banned on sframe mode'
    )
  })
})
