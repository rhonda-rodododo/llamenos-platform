#!/usr/bin/env bun
/**
 * Generate Tauri-compatible update manifest JSON (Epic 289).
 *
 * Generates the `latest.json` file that the Tauri updater plugin expects
 * at the configured endpoint(s). Reads version from package.json and
 * produces platform-specific entries for macOS, Linux, and Windows.
 *
 * Usage:
 *   bun run scripts/generate-update-manifest.ts \
 *     --version 0.18.0 \
 *     --notes "Bug fixes and improvements" \
 *     --output dist/latest.json \
 *     --url-base "https://releases.llamenos.org/desktop/v0.18.0"
 *
 * In CI, artifact signatures are read from .sig files produced by
 * `tauri build` with `createUpdaterArtifacts: true`.
 *
 * Environment variables:
 *   TAURI_SIGNING_PRIVATE_KEY - Ed25519 private key for signing (CI secret)
 *   TAURI_SIGNING_PRIVATE_KEY_PASSWORD - Password for the private key (CI secret)
 *
 * Key generation (one-time, keep private key secret):
 *   bunx tauri signer generate -w ~/.tauri/llamenos.key
 *
 * The public key goes in tauri.conf.json → plugins.updater.pubkey
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

// ── Parse arguments ──────────────────────────────────────────────

interface ManifestArgs {
  version: string
  notes: string
  output: string
  urlBase: string
  sigDir?: string
}

function parseArgs(): ManifestArgs {
  const args = process.argv.slice(2)
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '')
    const value = args[i + 1]
    if (key && value) {
      flags[key] = value
    }
  }

  // Default version from package.json
  const pkgPath = resolve(import.meta.dir, '../package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const version = flags['version'] ?? pkg.version

  return {
    version,
    notes: flags['notes'] ?? '',
    output: flags['output'] ?? 'dist/latest.json',
    urlBase: flags['url-base'] ?? `https://releases.llamenos.org/desktop/v${version}`,
    sigDir: flags['sig-dir'],
  }
}

// ── Platform definitions ─────────────────────────────────────────

interface PlatformEntry {
  url: string
  signature: string
}

interface UpdateManifest {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, PlatformEntry>
}

// Tauri platform identifiers → artifact filenames
const PLATFORMS: Record<string, { artifact: string; sigFile: string }> = {
  // macOS (Apple Silicon + Intel universal)
  'darwin-aarch64': {
    artifact: 'Hotline.app.tar.gz',
    sigFile: 'Hotline.app.tar.gz.sig',
  },
  'darwin-x86_64': {
    artifact: 'Hotline.app.tar.gz',
    sigFile: 'Hotline.app.tar.gz.sig',
  },
  // Linux
  'linux-x86_64': {
    artifact: 'hotline_amd64.AppImage.tar.gz',
    sigFile: 'hotline_amd64.AppImage.tar.gz.sig',
  },
  // Windows
  'windows-x86_64': {
    artifact: 'Hotline_x64_en-US.msi.zip',
    sigFile: 'Hotline_x64_en-US.msi.zip.sig',
  },
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const config = parseArgs()

  console.log(`Generating update manifest for v${config.version}`)
  console.log(`  URL base: ${config.urlBase}`)
  console.log(`  Output: ${config.output}`)

  const platforms: Record<string, PlatformEntry> = {}

  for (const [platform, { artifact, sigFile }] of Object.entries(PLATFORMS)) {
    // Try to read signature from .sig file
    let signature = ''

    if (config.sigDir) {
      const sigPath = join(config.sigDir, sigFile)
      if (existsSync(sigPath)) {
        signature = readFileSync(sigPath, 'utf8').trim()
        console.log(`  ${platform}: signature loaded from ${sigPath}`)
      } else {
        console.warn(`  ${platform}: signature file not found at ${sigPath}`)
      }
    }

    // If no sig file, check for individual platform env vars
    const envKey = `TAURI_SIG_${platform.replace('-', '_').toUpperCase()}`
    if (!signature && process.env[envKey]) {
      signature = process.env[envKey]!
      console.log(`  ${platform}: signature from ${envKey}`)
    }

    if (!signature) {
      console.warn(`  ${platform}: no signature — entry will have empty signature (not valid for production)`)
    }

    platforms[platform] = {
      url: `${config.urlBase}/${artifact}`,
      signature,
    }
  }

  const manifest: UpdateManifest = {
    version: config.version,
    notes: config.notes,
    pub_date: new Date().toISOString(),
    platforms,
  }

  writeFileSync(config.output, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`\nManifest written to ${config.output}`)
}

main()
