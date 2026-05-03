import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'
import { createInterface } from 'readline'

const ALLOWED_PUBKEY = 'aabbccdd'.repeat(8)
const UNKNOWN_PUBKEY = '11223344'.repeat(8)

function makeEventInput(pubkey: string, kind: number, id?: string) {
  return JSON.stringify({
    event: {
      id: id ?? 'evt-' + Math.random().toString(36).slice(2, 10),
      pubkey,
      kind,
      content: 'test',
      tags: [],
      sig: 'deadbeef',
      created_at: Math.floor(Date.now() / 1000),
    },
    receivedAt: Math.floor(Date.now() / 1000),
    sourceType: 'IP4',
    sourceInfo: '127.0.0.1',
  })
}

describe('strfry write-policy plugin', () => {
  let proc: ChildProcess
  let responses: string[] = []
  let ready: Promise<void>

  beforeAll(() => {
    const scriptPath = resolve(__dirname, '..', 'write-policy.sh')
    proc = spawn('bash', [scriptPath], {
      env: { ...process.env, ALLOWED_PUBKEY },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: proc.stdout! })
    rl.on('line', (line) => {
      responses.push(line)
    })

    // Give the process a moment to start
    ready = new Promise((resolve) => setTimeout(resolve, 100))
  })

  afterAll(() => {
    proc?.kill()
  })

  async function sendAndWait(input: string): Promise<Record<string, unknown>> {
    await ready
    const prevLen = responses.length
    proc.stdin!.write(input + '\n')
    // Wait for response
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (responses.length > prevLen) {
          clearInterval(check)
          resolve()
        }
      }, 10)
      // Timeout after 3s
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
    const last = responses[responses.length - 1]
    return JSON.parse(last)
  }

  it('accepts events from the allowed server pubkey', async () => {
    const result = await sendAndWait(makeEventInput(ALLOWED_PUBKEY, 1000, 'evt-allowed'))
    expect(result.action).toBe('accept')
    expect(result.id).toBe('evt-allowed')
  })

  it('rejects events from unknown pubkeys', async () => {
    const result = await sendAndWait(makeEventInput(UNKNOWN_PUBKEY, 1000, 'evt-unknown'))
    expect(result.action).toBe('reject')
    expect(result.id).toBe('evt-unknown')
    expect(result.msg).toBe('unauthorized publisher')
  })

  it('accepts NIP-42 auth events (kind 22242) from any pubkey', async () => {
    const result = await sendAndWait(makeEventInput(UNKNOWN_PUBKEY, 22242, 'evt-auth'))
    expect(result.action).toBe('accept')
    expect(result.id).toBe('evt-auth')
  })

  it('rejects non-auth events from unknown pubkeys even with valid event structure', async () => {
    const result = await sendAndWait(makeEventInput(UNKNOWN_PUBKEY, 20001, 'evt-ephemeral'))
    expect(result.action).toBe('reject')
    expect(result.id).toBe('evt-ephemeral')
  })
})
