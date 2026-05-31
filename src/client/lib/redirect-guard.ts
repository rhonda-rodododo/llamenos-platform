/**
 * Returns true only if `path` is a same-origin relative path safe to navigate to.
 *
 * Rejects:
 * - Protocol-relative URLs (//evil.com)
 * - External schemes (https://evil.com)
 * - Backslash-based bypass attempts (/\evil.com — some browsers normalize to //evil.com)
 *
 * Uses the URL API with a dummy base to detect cross-origin paths: if the resolved
 * origin differs from the dummy, the path is external.
 */
export function isSafeRelativePath(path: string): boolean {
  if (!path.startsWith('/')) return false
  try {
    const dummy = 'https://dummy.invalid'
    const resolved = new URL(path, dummy)
    return resolved.origin === dummy
  } catch {
    return false
  }
}
