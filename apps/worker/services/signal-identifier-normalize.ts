/**
 * Normalize a Signal identifier before hashing.
 *
 * Phone numbers: strip whitespace and dashes, ensure leading +.
 * Usernames: lowercase, strip leading @ if present.
 */
export function normalizeSignalIdentifier(
  raw: string,
  type: 'phone' | 'username'
): string {
  if (type === 'phone') {
    const stripped = raw.replace(/[\s\-().]/g, '')
    return stripped.startsWith('+') ? stripped : `+${stripped}`
  }
  // Username — strip leading @ (Signal usernames don't include it internally)
  return raw.toLowerCase().replace(/^@/, '')
}
