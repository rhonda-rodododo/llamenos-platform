#!/usr/bin/env bun
/**
 * Generate Tauri-compatible update manifest JSON (Epic 289).
 *
 * Generates the `latest.json` file that the Tauri updater plugin expects
 * at the configured endpoint(s). Reads version from package.json and
 * produces platform-specific entries for macOS, Linux, and Windows.
 *
 * CI builds a universal macOS binary (--target universal-apple-darwin),
 * so both darwin-aarch64 and darwin-x86_64 keys point to the same file.
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

// Tauri v2 artifact naming with productName "Hotline":
//   macOS universal: Hotline.app.tar.gz (single file for both archs)
//   Linux:           hotline_<ver>_amd64.AppImage.tar.gz
//   Windows:         Hotline_<ver>_x64-setup.nsis.zip
//
// Both darwin-aarch64 and darwin-x86_64 point to the same universal binary.
interface PlatformDef {
  /** Candidate artifact filenames in priority order */
  artifacts: string[]
  /** Candidate signature filenames in priority order */
  sigFiles: string[]
}

function platformDefs(version: string): Record<string, PlatformDef> {
  return {
    // macOS universal — both arch keys map to the same file
    'darwin-aarch64': {
      artifacts: ['Hotline.app.tar.gz'],
      sigFiles: ['Hotline.app.tar.gz.sig'],
    },
    'darwin-x86_64': {
      artifacts: ['Hotline.app.tar.gz'],
      sigFiles: ['Hotline.app.tar.gz.sig'],
    },
    // Linux
    'linux-x86_64': {
      artifacts: [`hotline_${version}_amd64.AppImage.tar.gz`, 'hotline_amd64.AppImage.tar.gz'],
      sigFiles: [`hotline_${version}_amd64.AppImage.tar.gz.sig`, 'hotline_amd64.AppImage.tar.gz.sig'],
    },
    // Windows
    'windows-x86_64': {
      artifacts: [`Hotline_${version}_x64-setup.nsis.zip`, 'Hotline_x64_en-US.msi.zip'],
      sigFiles: [`Hotline_${version}_x64-setup.nsis.zip.sig`, 'Hotline_x64_en-US.msi.zip.sig'],
    },
  }
}

// ── Main ─────────────────────────────────────────────────────────

function main() {
  const config = parseArgs()
  const defs = platformDefs(config.version)

  console.log(`Generating update manifest for v${config.version}`)
  console.log(`  URL base: ${config.urlBase}`)
  console.log(`  Output: ${config.output}`)

  const platforms: Record<string, PlatformEntry> = {}

  for (const [platform, def] of Object.entries(defs)) {
    // Try to read signature from .sig file (first match wins)
    let signature = ''
    let artifactName = def.artifacts[0]

    if (config.sigDir) {
      for (const sigFile of def.sigFiles) {
        const sigPath = join(config.sigDir, sigFile)
        if (existsSync(sigPath)) {
          signature = readFileSync(sigPath, 'utf8').trim()
          // Use corresponding artifact name
          const idx = def.sigFiles.indexOf(sigFile)
          artifactName = def.artifacts[idx] ?? def.artifacts[0]
          console.log(`  ${platform}: signature loaded from ${sigPath}`)
          break
        }
      }
      if (!signature) {
        console.warn(`  ${platform}: no signature file found in ${config.sigDir}`)
      }
    }

    // Fallback: check for individual platform env vars
    const envKey = `TAURI_SIG_${platform.replace('-', '_').toUpperCase()}`
    if (!signature && process.env[envKey]) {
      signature = process.env[envKey]!
      console.log(`  ${platform}: signature from ${envKey}`)
    }

    if (!signature) {
      console.warn(`  ${platform}: no signature — entry will have empty signature (not valid for production)`)
    }

    platforms[platform] = {
      url: `${config.urlBase}/${artifactName}`,
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
