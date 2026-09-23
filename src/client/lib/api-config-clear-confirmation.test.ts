import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Exercises the Tauri IPC mock (tests/mocks/tauri-core.ts) directly — NOT
 * through `platform.ts` — to prove the `api_config_clear` confirmation gate
 * (#788) itself. This is exactly the bypass the gate exists to refuse: a
 * compromised renderer (or a stray click handler) invoking the raw IPC
 * command without ever going through `platform.ts::clearConfiguredApiBase`,
 * which is the only place that requests a confirmation token first.
 *
 * The mock mirrors `apps/desktop/src/api_config.rs`'s `ClearConfirmState`
 * token dance — see that file's own `#[cfg(test)]` module for the equivalent
 * Rust-side coverage (no token, mismatched token, single-use, expiry).
 */

type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>

async function loadMockInvoke(): Promise<Invoke> {
  vi.resetModules()
  const mod = (await import('../../../tests/mocks/tauri-core')) as { invoke: Invoke }
  return mod.invoke
}

describe('api_config_clear confirmation gate', () => {
  beforeEach(() => {
    vi.stubEnv('PLAYWRIGHT_TEST', 'true')
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to clear when no confirmation was ever requested', async () => {
    const invoke = await loadMockInvoke()
    await expect(invoke('api_config_clear', { token: 'anything' })).rejects.toThrow(/confirm/i)
  })

  it('refuses a missing or empty token even after a confirmation was requested', async () => {
    const invoke = await loadMockInvoke()
    await invoke('api_config_request_clear')
    await expect(invoke('api_config_clear', {})).rejects.toThrow(/confirm/i)
    await expect(invoke('api_config_clear', { token: '' })).rejects.toThrow(/confirm/i)
  })

  it('clears once confirmed with the token the confirmation step issued', async () => {
    const invoke = await loadMockInvoke()
    await invoke('api_config_set', { url: 'https://app.example.org' })
    expect(await invoke('api_config_get')).toBe('https://app.example.org')

    const token = await invoke<string>('api_config_request_clear')
    await invoke('api_config_clear', { token })

    expect(await invoke('api_config_get')).toBeNull()
  })

  it('is single-use — the same token cannot clear twice', async () => {
    const invoke = await loadMockInvoke()
    const token = await invoke<string>('api_config_request_clear')
    await invoke('api_config_clear', { token })
    await expect(invoke('api_config_clear', { token })).rejects.toThrow(/confirm/i)
  })

  it('a mismatched guess does not invalidate the real pending token (no DoS via garbage tokens)', async () => {
    const invoke = await loadMockInvoke()
    const real = await invoke<string>('api_config_request_clear')
    await expect(invoke('api_config_clear', { token: 'not-it' })).rejects.toThrow(/confirm/i)
    await expect(invoke('api_config_clear', { token: real })).resolves.toBeUndefined()
  })

  it('requesting a new confirmation invalidates a previously issued token', async () => {
    const invoke = await loadMockInvoke()
    const first = await invoke<string>('api_config_request_clear')
    const second = await invoke<string>('api_config_request_clear')
    expect(first).not.toBe(second)
    await expect(invoke('api_config_clear', { token: first })).rejects.toThrow(/confirm/i)
    await expect(invoke('api_config_clear', { token: second })).resolves.toBeUndefined()
  })
})
