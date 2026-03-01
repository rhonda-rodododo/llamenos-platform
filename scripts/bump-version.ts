#!/usr/bin/env bun
/**
 * Bump version across ALL versioned files, tag, and regenerate changelog.
 *
 * Usage:
 *   bun run version:bump <major|minor|patch> [description]
 *
 * Example:
 *   bun run version:bump minor "Epic 55 — Cloudflare Tunnel"
 *
 * This will:
 *   1. Bump the version in package.json
 *   2. Sync version to apps/desktop/tauri.conf.json
 *   3. Sync version to apps/desktop/Cargo.toml
 *   4. Sync appVersion in deploy/helm/llamenos/Chart.yaml
 *   5. Sync version in flatpak/org.llamenos.Hotline.metainfo.xml (latest release)
 *   6. Commit the version change
 *   7. Create an annotated git tag
 *   8. Regenerate CHANGELOG.md via git-cliff
 *   9. Commit the updated changelog
 *
 * It does NOT push — run `git push && git push --tags` manually.
 */

import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'

const ROOT = resolve(import.meta.dirname, '..')
const PKG_PATH = resolve(ROOT, 'package.json')
const TAURI_CONF_PATH = resolve(ROOT, 'apps/desktop/tauri.conf.json')
const CARGO_TOML_PATH = resolve(ROOT, 'apps/desktop/Cargo.toml')
const CHART_PATH = resolve(ROOT, 'deploy/helm/llamenos/Chart.yaml')
const METAINFO_PATH = resolve(ROOT, 'flatpak/org.llamenos.Hotline.metainfo.xml')
const ANDROID_GRADLE_PATH = resolve(ROOT, 'apps/android/app/build.gradle.kts')
const IOS_PLIST_PATH = resolve(ROOT, 'apps/ios/Sources/App/Info.plist')

type BumpType = 'major' | 'minor' | 'patch'

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

function bumpVersion(current: string, type: BumpType): string {
  const parts = current.split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${current}`)
  }
  const [major, minor, patch] = parts
  switch (type) {
    case 'major': return `${major + 1}.0.0`
    case 'minor': return `${major}.${minor + 1}.0`
    case 'patch': return `${major}.${minor}.${patch + 1}`
  }
}

function updateTauriConf(newVersion: string): void {
  const conf = JSON.parse(readFileSync(TAURI_CONF_PATH, 'utf-8'))
  conf.version = newVersion
  writeFileSync(TAURI_CONF_PATH, JSON.stringify(conf, null, 2) + '\n')
  console.log(`  apps/desktop/tauri.conf.json → ${newVersion}`)
}

function updateCargoToml(newVersion: string): void {
  let content = readFileSync(CARGO_TOML_PATH, 'utf-8')
  // Replace the version in [package] section (first occurrence)
  content = content.replace(
    /^(version\s*=\s*)"[^"]*"/m,
    `$1"${newVersion}"`
  )
  writeFileSync(CARGO_TOML_PATH, content)
  console.log(`  apps/desktop/Cargo.toml → ${newVersion}`)
}

function updateChartYaml(newVersion: string): void {
  let content = readFileSync(CHART_PATH, 'utf-8')
  content = content.replace(
    /^(appVersion:\s*)"[^"]*"/m,
    `$1"${newVersion}"`
  )
  writeFileSync(CHART_PATH, content)
  console.log(`  deploy/helm/llamenos/Chart.yaml appVersion → ${newVersion}`)
}

function updateMetainfo(newVersion: string): void {
  try {
    let content = readFileSync(METAINFO_PATH, 'utf-8')
    const today = new Date().toISOString().split('T')[0]
    // Update the first (latest) <release> tag's version and date
    content = content.replace(
      /<release version="[^"]*" date="[^"]*">/,
      `<release version="${newVersion}" date="${today}">`
    )
    writeFileSync(METAINFO_PATH, content)
    console.log(`  flatpak/metainfo.xml → ${newVersion} (${today})`)
  } catch {
    console.log('  flatpak/metainfo.xml — skipped (file not found)')
  }
}

function updateAndroidGradle(newVersion: string): void {
  try {
    let content = readFileSync(ANDROID_GRADLE_PATH, 'utf-8')
    // Update versionName
    content = content.replace(
      /versionName\s*=\s*"[^"]*"/,
      `versionName = "${newVersion}"`
    )
    // Auto-increment versionCode (extract current, +1)
    const codeMatch = content.match(/versionCode\s*=\s*(\d+)/)
    if (codeMatch) {
      const newCode = parseInt(codeMatch[1], 10) + 1
      content = content.replace(
        /versionCode\s*=\s*\d+/,
        `versionCode = ${newCode}`
      )
      console.log(`  apps/android/app/build.gradle.kts → ${newVersion} (versionCode ${newCode})`)
    } else {
      console.log(`  apps/android/app/build.gradle.kts → ${newVersion}`)
    }
    writeFileSync(ANDROID_GRADLE_PATH, content)
  } catch {
    console.log('  apps/android/app/build.gradle.kts — skipped (file not found)')
  }
}

function updateIOSPlist(newVersion: string): void {
  try {
    let content = readFileSync(IOS_PLIST_PATH, 'utf-8')
    // Update CFBundleShortVersionString
    content = content.replace(
      /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
      `$1${newVersion}$2`
    )
    // Auto-increment CFBundleVersion (build number)
    const buildMatch = content.match(/<key>CFBundleVersion<\/key>\s*<string>(\d+)<\/string>/)
    if (buildMatch) {
      const newBuild = parseInt(buildMatch[1], 10) + 1
      content = content.replace(
        /(<key>CFBundleVersion<\/key>\s*<string>)\d+(<\/string>)/,
        `$1${newBuild}$2`
      )
      console.log(`  apps/ios/Sources/App/Info.plist → ${newVersion} (build ${newBuild})`)
    } else {
      console.log(`  apps/ios/Sources/App/Info.plist → ${newVersion}`)
    }
    writeFileSync(IOS_PLIST_PATH, content)
  } catch {
    console.log('  apps/ios/Sources/App/Info.plist — skipped (file not found)')
  }
}

// --- Main ---

const [bumpType, ...descParts] = process.argv.slice(2)
const description = descParts.join(' ')

if (!bumpType || !['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('Usage: bun run version:bump <major|minor|patch> [description]')
  process.exit(1)
}

// Check for uncommitted changes
const status = run('git status --porcelain')
if (status) {
  console.error('Error: Working tree has uncommitted changes. Commit or stash first.')
  process.exit(1)
}

// Read and bump version
const pkg = JSON.parse(readFileSync(PKG_PATH, 'utf-8'))
const oldVersion = pkg.version
const newVersion = bumpVersion(oldVersion, bumpType as BumpType)

console.log(`Bumping ${oldVersion} → ${newVersion}\n`)
console.log('Updating version files:')

// Update all version files
pkg.version = newVersion
writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
console.log(`  package.json → ${newVersion}`)

updateTauriConf(newVersion)
updateCargoToml(newVersion)
updateChartYaml(newVersion)
updateMetainfo(newVersion)
updateAndroidGradle(newVersion)
updateIOSPlist(newVersion)

// Commit version bump
const tagMessage = description || `release v${newVersion}`
run('git add package.json apps/desktop/tauri.conf.json apps/desktop/Cargo.toml deploy/helm/llamenos/Chart.yaml flatpak/org.llamenos.Hotline.metainfo.xml apps/android/app/build.gradle.kts apps/ios/Sources/App/Info.plist')
run(`git commit -m "chore: bump version to ${newVersion}"`)

// Create annotated tag
run(`git tag -a v${newVersion} -m "${tagMessage}"`)
console.log(`\nTagged v${newVersion}`)

// Regenerate changelog
run('git-cliff --output CHANGELOG.md')
run('git add CHANGELOG.md')
run(`git commit -m "chore: update changelog for v${newVersion}"`)

console.log(`\nDone! Version ${newVersion} is ready.`)
console.log('Run the following to publish:')
console.log('  git push && git push --tags')
