#!/usr/bin/env bun
/**
 * Generate an admin device key for headless / CI setups (CLI method).
 *
 * The recommended approach is the in-app setup wizard — visit your deployed
 * app and it generates the key on the admin's device. This script is for
 * setups where that is not possible.
 *
 * Prints the two PUBLIC values for server config (ADMIN_PUBKEY,
 * ADMIN_DECRYPTION_PUBKEY) separately from the SECRET device seed. See
 * scripts/lib/bootstrap-admin-keys.ts for the derivation.
 *
 * Usage:
 *   bun run bootstrap-admin
 */

import { bytesToHex } from '@noble/hashes/utils.js'
import { generateAdminKeys, formatBootstrapOutput } from './lib/bootstrap-admin-keys'

const serverSecret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
console.log(formatBootstrapOutput(generateAdminKeys(), serverSecret))
