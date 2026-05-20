import DOMPurify, { type Config } from 'dompurify'

const purifyConfig: Config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'span', 'a'],
  ALLOWED_ATTR: ['href', 'class', 'title'],
  ALLOW_DATA_ATTR: false,
}

/**
 * Sanitize HTML string using DOMPurify with a strict allowlist.
 * Only permits safe formatting tags (b, i, em, strong, br, p, span, a)
 * and safe attributes (href, class, title).
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, purifyConfig) as string
}
