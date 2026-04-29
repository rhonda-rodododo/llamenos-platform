import { marked } from 'marked';

export interface ParsedSlide {
  index: number;
  html: string;
  notes: string;
  background: string | null;
  layout: 'default' | 'columns' | 'title' | 'quote' | 'image';
  classes: string[];
}

// Inline notes: <!-- notes: ... -->
const INLINE_NOTES_RE = /<!--\s*notes?:\s*([\s\S]*?)-->/gi;
// Block notes: :::notes ... :::
const BLOCK_NOTES_RE = /:::notes?\s*\n([\s\S]*?):::/gi;
// Background image directive
const BACKGROUND_RE = /^:::background\(([^)]+)\)\s*\n?/m;
// Columns block — closing ::: must be on its own line (not :::left/:::right/:::fragment etc.)
const COLUMNS_RE = /:::columns\s*\n([\s\S]*?)^:::$/gm;
// Left side within columns — stops at :::right or end
const LEFT_RE = /:::left\s*\n([\s\S]*?)(?=:::right|$)/;
// Right side within columns — captures everything after :::right to end
const RIGHT_RE = /:::right\s*\n([\s\S]*?)$/;
// Fragment (incremental reveal) — closing ::: on its own line
const FRAGMENT_RE = /:::fragment\s*\n?([\s\S]*?)^:::$/gm;

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

function extractNotes(raw: string): { text: string; notes: string } {
  const noteParts: string[] = [];

  let text = raw.replace(new RegExp(BLOCK_NOTES_RE.source, 'gi'), (_match: string, content: string) => {
    noteParts.push(content.trim());
    return '';
  });

  text = text.replace(new RegExp(INLINE_NOTES_RE.source, 'gi'), (_match: string, content: string) => {
    noteParts.push(content.trim());
    return '';
  });

  return { text: text.trim(), notes: noteParts.join('\n\n') };
}

function extractBackground(raw: string): { text: string; background: string | null } {
  const match = BACKGROUND_RE.exec(raw);
  if (!match) return { text: raw, background: null };
  return {
    text: raw.replace(BACKGROUND_RE, '').trim(),
    background: match[1].trim(),
  };
}

function processColumns(raw: string): string {
  return raw.replace(new RegExp(COLUMNS_RE.source, 'gm'), (_match: string, inner: string) => {
    const leftMatch = LEFT_RE.exec(inner);
    const rightMatch = RIGHT_RE.exec(inner);
    const leftContent = leftMatch ? leftMatch[1].trim() : '';
    const rightContent = rightMatch ? rightMatch[1].trim() : '';
    return [
      '<div class="slide-columns">',
      `<div class="slide-col">${markdownToHtml(leftContent)}</div>`,
      `<div class="slide-col">${markdownToHtml(rightContent)}</div>`,
      '</div>',
    ].join('');
  });
}

function processFragments(raw: string): string {
  return raw.replace(new RegExp(FRAGMENT_RE.source, 'gm'), (_match: string, content: string) => {
    return `<div class="fragment" data-fragment-hidden="true">${markdownToHtml(content.trim())}</div>`;
  });
}

function detectLayout(html: string, background: string | null): ParsedSlide['layout'] {
  if (background) return 'image';
  if (html.includes('slide-columns')) return 'columns';
  if (/<h1[^>]*>/.test(html)) return 'title';
  if (/<blockquote[^>]*>/.test(html)) return 'quote';
  return 'default';
}

// Split markdown into pre-rendered HTML blocks and raw markdown sections,
// render only the raw sections, then reassemble.
function renderMixed(text: string): string {
  // Markers for already-processed HTML blocks
  const blockRe = /(<div class="(?:slide-columns|fragment)"[\s\S]*?<\/div>\s*(?:<\/div>)?)/g;
  if (!blockRe.test(text)) {
    return markdownToHtml(text);
  }
  blockRe.lastIndex = 0;

  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const rawSection = text.slice(lastIndex, match.index).trim();
      if (rawSection) parts.push(markdownToHtml(rawSection));
    }
    parts.push(match[0]);
    lastIndex = blockRe.lastIndex;
  }

  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex).trim();
    if (tail) parts.push(markdownToHtml(tail));
  }

  return parts.join('');
}

export function parseSlideDeck(body: string): ParsedSlide[] {
  // Split on slide separator (--- on its own line)
  const rawSlides = body.split(/\n---\n/);

  return rawSlides
    .map((raw, index) => {
      const trimmed = raw.trim();
      if (!trimmed) return null;

      const { text: textNoNotes, notes } = extractNotes(trimmed);
      const { text: textNoBg, background } = extractBackground(textNoNotes);

      // Process custom directives before markdown rendering
      let processed = processColumns(textNoBg);
      processed = processFragments(processed);

      const html = renderMixed(processed);
      const layout = detectLayout(html, background);

      return {
        index,
        html,
        notes,
        background,
        layout,
        classes: [`slide-layout-${layout}`],
      } satisfies ParsedSlide;
    })
    .filter((s): s is ParsedSlide => s !== null);
}
