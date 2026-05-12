#!/usr/bin/env bun
/**
 * Extract SHA-256 SPKI certificate pins from a live domain and inject them
 * into the Android and iOS mobile app source files.
 *
 * Usage: bun scripts/inject-cert-pins.ts <domain> [port]
 *
 * This script is idempotent — it can be re-run safely after certificate
 * rotation to update the pins in place.
 *
 * See docs/security/CERTIFICATE_PINS.md for details.
 */

import { $ } from "bun";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const ANDROID_FILE = resolve(
  ROOT,
  "apps/android/app/src/main/java/org/llamenos/hotline/api/ApiService.kt",
);
const IOS_FILE = resolve(ROOT, "apps/ios/Sources/Services/APIService.swift");

// ---------------------------------------------------------------------------
// 1. Parse arguments
// ---------------------------------------------------------------------------

const domain = process.argv[2];
const port = process.argv[3] ?? "443";

if (!domain) {
  console.error("Usage: bun scripts/inject-cert-pins.ts <domain> [port]");
  console.error("Example: bun scripts/inject-cert-pins.ts app.llamenos.org");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Extract pins via the shell script
// ---------------------------------------------------------------------------

console.log(`Extracting certificate pins from ${domain}:${port} ...`);

const extractScript = resolve(ROOT, "scripts/extract-cert-pins.sh");
const result =
  await $`bash ${extractScript} ${domain} ${port}`.text();

const pins: Record<string, string> = {};
for (const line of result.trim().split("\n")) {
  const [key, value] = line.split("=", 2);
  if (key && value) {
    pins[key] = value;
  }
}

const leafPin = pins["LEAF"];
const intermediatePin = pins["INTERMEDIATE"];

if (!leafPin || !intermediatePin) {
  console.error("Error: failed to parse pins from extract-cert-pins.sh output:");
  console.error(result);
  process.exit(1);
}

console.log(`  Leaf pin:         sha256/${leafPin}`);
console.log(`  Intermediate pin: sha256/${intermediatePin}`);
console.log();

// ---------------------------------------------------------------------------
// 3. Inject into Android (ApiService.kt)
// ---------------------------------------------------------------------------

{
  const original = await readFile(ANDROID_FILE, "utf-8");

  // Match the CertificatePinner block — replace any existing .add() lines
  // between CertificatePinner.Builder() and .build()
  const pinnerBlockRe =
    /(val certificatePinner: CertificatePinner = CertificatePinner\.Builder\(\)\n)([\s\S]*?)(            \.build\(\))/;

  const match = original.match(pinnerBlockRe);
  if (!match) {
    console.error(
      "Error: could not find CertificatePinner.Builder() block in Android ApiService.kt",
    );
    process.exit(1);
  }

  // Derive the wildcard domain pattern from the input domain
  // e.g. app.llamenos.org -> *.llamenos.org
  const parts = domain.split(".");
  const wildcardDomain =
    parts.length >= 3
      ? `*.${parts.slice(1).join(".")}`
      : `*.${domain}`;

  const newAddLines = [
    `            // Leaf certificate pin (extracted from ${domain})`,
    `            .add("${wildcardDomain}", "sha256/${leafPin}")`,
    `            // Intermediate CA pin (backup per RFC 7469)`,
    `            .add("${wildcardDomain}", "sha256/${intermediatePin}")`,
  ].join("\n") + "\n";

  const updated = original.replace(
    pinnerBlockRe,
    `$1${newAddLines}$3`,
  );

  if (updated === original) {
    console.log("Android: no changes needed (pins already match)");
  } else {
    await writeFile(ANDROID_FILE, updated);
    console.log(`Android: updated ${ANDROID_FILE}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Inject into iOS (APIService.swift)
// ---------------------------------------------------------------------------

{
  const original = await readFile(IOS_FILE, "utf-8");

  // Match the cloudflareHashes array contents
  const hashArrayRe =
    /(static let cloudflareHashes: \[String\] = \[)\n([\s\S]*?)(    \])/;

  const match = original.match(hashArrayRe);
  if (!match) {
    console.error(
      "Error: could not find cloudflareHashes array in iOS APIService.swift",
    );
    process.exit(1);
  }

  const newArrayContents = [
    `        // Leaf certificate pin (extracted from ${domain})`,
    `        "${leafPin}",`,
    `        // Intermediate CA pin (backup per RFC 7469)`,
    `        "${intermediatePin}",`,
  ].join("\n") + "\n";

  const updated = original.replace(
    hashArrayRe,
    `$1\n${newArrayContents}$3`,
  );

  if (updated === original) {
    console.log("iOS: no changes needed (pins already match)");
  } else {
    await writeFile(IOS_FILE, updated);
    console.log(`iOS: updated ${IOS_FILE}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Summary
// ---------------------------------------------------------------------------

console.log();
console.log("Certificate pins injected successfully.");
console.log("Remember to also update docs/security/CERTIFICATE_PINS.md with the new pin values.");
console.log();
console.log("Next steps:");
console.log("  1. Review the diffs: git diff apps/android apps/ios");
console.log("  2. Build and test both platforms");
console.log("  3. Commit the changes");
