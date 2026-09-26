#!/usr/bin/env bun
/**
 * Startup invariant: Bun's native text layer must actually work on this host.
 *
 * Bun routes UTF-8 and base64 work -- Buffer, TextEncoder, btoa, console
 * output, and the SCRAM-SHA-256 client proof inside Bun.SQL -- through simdutf,
 * which picks a SIMD kernel from CPUID on first use. When it finds no usable
 * kernel it silently installs a stub whose operations return 0 / empty (see the
 * "simdutf kernel pin" block in deploy/docker/Dockerfile). Nothing throws:
 * PostgreSQL rejects the empty SCRAM proof, some base64 encodes never return,
 * and non-ASCII text encodes to nothing. This check turns that silent
 * corruption into a loud startup failure.
 *
 * This file is pure ASCII on purpose (Bun decodes its own source through the
 * same text layer). Written to survive the failure it detects:
 *   - the checks that return a wrong value run BEFORE the one that can spin
 *     forever (a 32-byte base64 encode -- exactly the SCRAM proof size), and the
 *     entrypoint runs this file under `timeout` for that last case;
 *   - a failing check prints NOTHING and exits with its own status code. On a
 *     broken text layer even writing an ASCII string of a few dozen characters
 *     to stderr spins forever, so the entrypoint (plain sh) translates the
 *     code into the message and prints the CPU diagnostics.
 * Keep FAILURE_EXIT_CODES in sync with deploy/docker/docker-entrypoint.sh.
 */

// "h, e-acute, check mark" x50: 50 x (1 + 2 + 3) UTF-8 bytes. The stub reports 0 or 3.
const NON_ASCII = 'h\u00e9\u2713'.repeat(50)
const NON_ASCII_UTF8_BYTES = 300

// 32 bytes, the size of a SCRAM-SHA-256 client proof. The expected value was
// computed independently of Bun (RFC 4648 standard alphabet, padded).
const PROOF_SIZED = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 1) & 0xff)
const PROOF_SIZED_BASE64 = 'AQgPFh0kKzI5QEdOVVxjanF4f4aNlJuiqbC3vsXM09o='

const FAILURE_EXIT_CODES = {
  utf8ByteLength: 10,
  textEncoder: 11,
  btoa: 12,
  atob: 13,
  base64ProofSized: 14,
} as const

if (Buffer.byteLength(NON_ASCII, 'utf8') !== NON_ASCII_UTF8_BYTES) process.exit(FAILURE_EXIT_CODES.utf8ByteLength)
if (new TextEncoder().encode(NON_ASCII).length !== NON_ASCII_UTF8_BYTES) process.exit(FAILURE_EXIT_CODES.textEncoder)
if (btoa('abcd') !== 'YWJjZA==') process.exit(FAILURE_EXIT_CODES.btoa)
if (atob('YWJjZA==') !== 'abcd') process.exit(FAILURE_EXIT_CODES.atob)
if (Buffer.from(PROOF_SIZED).toString('base64') !== PROOF_SIZED_BASE64) process.exit(FAILURE_EXIT_CODES.base64ProofSized)

process.stdout.write(
  '[verify-runtime] text layer OK (bun ' + Bun.version + ', ' + process.arch +
    ', SIMDUTF_FORCE_IMPLEMENTATION=' + (process.env.SIMDUTF_FORCE_IMPLEMENTATION ?? '(unset)') + ')\n',
)
