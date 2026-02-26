/**
 * WebdriverIO configuration for Tauri desktop E2E tests.
 *
 * Uses tauri-driver (WebDriver protocol) to control the Tauri app.
 * Install tauri-driver: `cargo install tauri-driver --locked`
 *
 * Run tests: `bun run test:desktop`
 * Run specific: `bunx wdio tests/desktop/wdio.conf.ts --spec specs/launch.spec.ts`
 *
 * Epic 88: Desktop & Mobile E2E Tests.
 */

import { spawn, spawnSync, type ChildProcess } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Resolve the Tauri debug binary path
const binaryName = process.platform === 'win32' ? 'llamenos-desktop.exe' : 'llamenos-desktop'
const application = path.resolve(__dirname, '..', '..', 'src-tauri', 'target', 'debug', binaryName)

let tauriDriver: ChildProcess | null = null
let exitCalled = false

export const config: WebdriverIO.Config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4444,
  specs: ['./specs/**/*.spec.ts'],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error -- WebdriverIO doesn't type tauri:options but tauri-driver accepts it
      'tauri:options': { application },
      browserName: 'wry',
      maxInstances: 1,
    },
  ],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 30_000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60_000,
  },
  tsConfigPath: path.resolve(__dirname, '..', '..', 'tsconfig.json'),

  // Build the Tauri debug binary before running tests
  onPrepare() {
    console.log('Building Tauri debug binary...')
    const result = spawnSync('bun', ['run', 'tauri:build', '--', '--debug', '--no-bundle'], {
      cwd: path.resolve(__dirname, '..', '..'),
      stdio: 'inherit',
      shell: true,
      timeout: 300_000,
    })
    if (result.status !== 0) {
      throw new Error(`Tauri build failed with status ${result.status}`)
    }
  },

  // Start tauri-driver before the test session
  beforeSession() {
    const driverPath = path.resolve(os.homedir(), '.cargo', 'bin', 'tauri-driver')
    tauriDriver = spawn(driverPath, [], {
      stdio: [null, process.stdout, process.stderr],
    })

    tauriDriver.on('error', (error) => {
      console.error('tauri-driver error:', error)
      if (!exitCalled) process.exit(1)
    })

    tauriDriver.on('exit', (code) => {
      if (!exitCalled) {
        console.error(`tauri-driver exited unexpectedly with code ${code}`)
      }
    })
  },

  // Kill tauri-driver after test session
  afterSession() {
    exitCalled = true
    tauriDriver?.kill()
    tauriDriver = null
  },
}

// Ensure cleanup on unexpected exit
function onShutdown(fn: () => void) {
  const cleanup = () => {
    try {
      fn()
    } finally {
      process.exit()
    }
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('SIGHUP', cleanup)
}

onShutdown(() => {
  exitCalled = true
  tauriDriver?.kill()
})
