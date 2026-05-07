# Blog for Llámenos Marketing Site — Design Spec

**Date:** 2026-05-07  
**Scope:** Add a full-featured blog to the Astro marketing site (`site/`) with tags, deterministic OG images, semantic metadata, RSS, and sitemap integration. English-only initially; i18n-ready architecture.

---

## 1. Goals

- Provide a content channel for project updates, security research, and volunteer stories
- Maximize social shareability via deterministic OG images and rich metadata
- Maintain visual consistency with the existing Llámenos site design
- Keep authoring simple: Markdown files in the repo
- Ensure full SEO coverage: sitemap, RSS, structured data, canonical URLs

## 2. Content Architecture

### 2.1 Collection Definition

Add a `blog` collection to `src/content.config.ts`:

```ts
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('Llámenos Team'),
    authorUrl: z.string().optional(),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().optional(), // relative to public/ e.g. "/images/blog/cover.png"
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
  }),
});
```

### 2.2 Content Location

- **Source:** `site/src/content/blog/*.md`
- **Assets:** `site/public/images/blog/` for cover images
- **URL structure:**
  - `/blog` — blog index
  - `/blog/[slug]` — individual post
  - `/blog/tag/[tag]` — tag-filtered listing
  - `/blog/rss.xml` — RSS feed

### 2.3 Sample Post Frontmatter

```yaml
---
title: "End-to-End Encryption for Crisis Hotlines"
description: "How Llámenos uses HPKE and per-note forward secrecy to protect caller data."
pubDate: 2026-05-07
author: "Security Team"
tags: ["security", "encryption", "architecture"]
coverImage: "/images/blog/encryption-cover.png"
featured: true
---
```

## 3. Pages

### 3.1 Blog Index (`/blog`)

**File:** `src/pages/blog/index.astro`

**Layout:**
1. **Hero section** — Featured post (if any `featured: true` post exists). Reuses site hero patterns: gradient orb background, large title, excerpt, "Read article" CTA.
2. **Tag cloud** — Horizontal scrollable pills of all unique tags across non-draft posts. Each pill links to `/blog/tag/[tag]`.
3. **Post grid** — 3-column grid on desktop, 2 on tablet, 1 on mobile. Sorted by `pubDate` descending. Drafts excluded in production.
4. **Pagination** — Not needed initially (load all posts; add pagination when > 20 posts).

**Empty state:** If no posts exist, show a friendly message: "No posts yet. Check back soon!"

### 3.2 Post Detail (`/blog/[slug]`)

**File:** `src/pages/blog/[slug].astro`

**Layout:**
1. **Cover/header** — Full-width cover image (if provided) or gradient fallback. Title, author, date, read time, tags.
2. **Content** — Rendered Markdown wrapped in `.prose` class (existing styles handle all typography).
3. **Table of Contents** — Auto-generated from `h2`/`h3` headings. Sticky sidebar on desktop, collapsible on mobile.
4. **Prev/Next navigation** — Links to chronologically adjacent posts.
5. **Related posts** — Up to 3 posts sharing the most tags.
6. **Back to blog** — Link to `/blog`.

### 3.3 Tag Listing (`/blog/tag/[tag]`)

**File:** `src/pages/blog/tag/[tag].astro`

**Layout:**
- Same grid as blog index, filtered to posts containing the tag
- Tag name as page title: `"Posts tagged \"#[tag]\" | Llámenos Blog"`
- Link back to all posts

### 3.4 RSS Feed (`/blog/rss.xml`)

**File:** `src/pages/blog/rss.xml.ts`

- Uses `@astrojs/rss`
- Includes title, description, pubDate, link, and content (or excerpt) for each non-draft post
- Sorted by pubDate descending

## 4. Components

### 4.1 New Components

| Component | File | Purpose |
|-----------|------|---------|
| `BlogCard` | `src/components/BlogCard.astro` | Post card for grids: cover image, title, excerpt, date, tags, read time estimate |
| `BlogHero` | `src/components/BlogHero.astro` | Featured post highlight on index page |
| `TagCloud` | `src/components/TagCloud.astro` | Horizontal scrollable tag pills |
| `BlogPostMeta` | `src/components/BlogPostMeta.astro` | Author avatar (placeholder), date, read time, tags bar |
| `PrevNext` | `src/components/PrevNext.astro` | Previous/next post navigation arrows |
| `RelatedPosts` | `src/components/RelatedPosts.astro` | "You might also like" grid |
| `TableOfContents` | `src/components/TableOfContents.astro` | Auto-generated TOC from headings |
| `OgImage` | `src/components/OgImage.tsx` | Satori-based OG image JSX component (used by API route) |

### 4.2 Reused Components

- `BaseLayout.astro` — extended with blog-specific `<head>` metadata
- `Header.astro` — add "Blog" to nav items
- `Footer.astro` — no changes needed

## 5. OG Image Generation

### 5.1 Approach

Build-time generation using **Satori** (JSX → SVG) + **@resvg/resvg-js** (SVG → PNG).

### 5.2 Endpoint

**File:** `src/pages/og/blog/[slug].png.ts`

- Accepts `slug` param
- Loads post via `getCollection('blog')`
- Renders OG image JSX via Satori
- Converts to PNG via resvg
- Returns `Response` with `Content-Type: image/png`

### 5.3 Visual Design

- **Dimensions:** 1200×630
- **Background:** `oklch(0.1 0.01 250)` (site bg color) with subtle noise texture
- **Top:** Llámenos wordmark (small, muted)
- **Center:** Post title in DM Sans, large (48–64px), white
- **Bottom-left:** Tag pill (if post has tags) — `bg-accent/20 text-accent-bright rounded-full px-3 py-1`
- **Bottom-right:** "llamenos-hotline.com" in small muted text
- **Accent line:** Thin `accent` colored line separating top wordmark from title

### 5.4 Determinism

- Same input (title, tags) always produces same pixel output
- No random elements, no timestamps in image
- Font: DM Sans loaded from local file or base64-embedded

### 5.5 Caching

- Images are generated at build time for static output
- No runtime generation needed

## 6. Semantic Metadata

### 6.1 OpenGraph (per post)

```html
<meta property="og:type" content="article" />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={`https://llamenos-hotline.com/og/blog/${slug}.png`} />
<meta property="og:url" content={`https://llamenos-hotline.com/blog/${slug}`} />
<meta property="article:published_time" content={pubDate.toISOString()} />
<meta property="article:modified_time" content={updatedDate?.toISOString()} />
<meta property="article:author" content={author} />
{tags.map(tag => <meta property="article:tag" content={tag} />)}
```

### 6.2 Twitter Cards

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={`https://llamenos-hotline.com/og/blog/${slug}.png`} />
```

### 6.3 JSON-LD Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "...",
  "description": "...",
  "image": "https://llamenos-hotline.com/og/blog/...",
  "datePublished": "...",
  "dateModified": "...",
  "author": {
    "@type": "Organization",
    "name": "Llámenos"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Llámenos",
    "logo": {
      "@type": "ImageObject",
      "url": "https://llamenos-hotline.com/favicon.svg"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://llamenos-hotline.com/blog/..."
  }
}
```

### 6.4 Canonical URLs

```html
<link rel="canonical" href={`https://llamenos-hotline.com/blog/${slug}`} />
```

## 7. Sitemap & RSS

### 7.1 Sitemap

The existing `@astrojs/sitemap` integration automatically includes all statically generated pages. Blog pages (`/blog`, `/blog/[slug]`, `/blog/tag/[tag]`) are included via `getStaticPaths()`.

No configuration changes needed — sitemap picks them up automatically.

### 7.2 RSS Feed

**File:** `src/pages/blog/rss.xml.ts`

Uses `@astrojs/rss` to generate a standard RSS 2.0 feed:
- Title: "Llámenos Blog"
- Description: "Updates on secure crisis hotline technology"
- Site URL: `https://llamenos-hotline.com`
- Items: all non-draft posts, sorted by pubDate descending
- Content: full Markdown HTML rendered body (or excerpt if preferred)

## 8. Navigation Integration

### 8.1 Header Update

Add "Blog" to the nav items in `Header.astro`:

```ts
const navItems = [
  { href: lp('/features'), label: t.nav.features },
  { href: lp('/security'), label: t.nav.security },
  { href: lp('/download'), label: t.nav.download },
  { href: lp('/docs'), label: t.nav.docs },
  { href: '/blog', label: 'Blog' }, // NEW
];
```

Blog link is not localized (English-only for now).

### 8.2 Footer Update

Optionally add a "Blog" link under the Project column in `Footer.astro`.

## 9. Visual Design Details

### 9.1 Color Palette (existing)

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `oklch(0.1 0.01 250)` | Page background |
| `bg-soft` | `oklch(0.14 0.01 250)` | Card hover, subtle sections |
| `bg-card` | `oklch(0.16 0.012 250)` | Cards, elevated surfaces |
| `fg` | `oklch(0.96 0 0)` | Headings, primary text |
| `fg-muted` | `oklch(0.65 0 0)` | Body text, descriptions |
| `fg-dim` | `oklch(0.45 0 0)` | Meta text, captions |
| `accent` | `oklch(0.60 0.14 195)` | Primary accent |
| `accent-bright` | `oklch(0.72 0.15 195)` | Hover states, links |
| `border` | `oklch(0.22 0.01 250)` | Card borders, dividers |

### 9.2 Typography (existing)

- **Headings:** DM Sans, bold, tight tracking (`-0.025em` for h1, `-0.015em` for h2)
- **Body:** DM Sans / Inter, regular, `1.75` line-height
- **Code:** JetBrains Mono
- **Prose class:** Already handles all Markdown typography

### 9.3 Spacing & Layout

- Max content width: `72ch` for prose, `max-w-6xl` for page containers
- Card grid gap: `gap-6` (1.5rem)
- Card padding: `p-6`
- Card border-radius: `rounded-xl` (0.75rem)
- Section vertical padding: `py-16` to `py-20`

### 9.4 Animations (existing patterns)

- Card hover: `hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300`
- Badge entrance: `fade-up` animation (reused from Hero)
- Tag pills: `hover:bg-accent/20 transition-colors`

## 10. Dependencies

Add to `site/package.json`:

```json
{
  "satori": "^0.12.0",
  "@resvg/resvg-js": "^2.6.0",
  "@astrojs/rss": "^4.0.0"
}
```

No MDX integration needed initially. Plain Markdown is sufficient.

## 11. File Inventory

### New Files

```
site/src/content/blog/
  _example-post.md              # Sample post + authoring template
site/src/pages/blog/
  index.astro                   # Blog listing
  [slug].astro                  # Post detail
  tag/
    [tag].astro                 # Tag filter
  rss.xml.ts                    # RSS feed
site/src/pages/og/blog/
  [slug].png.ts                 # OG image endpoint
site/src/components/
  BlogCard.astro
  BlogHero.astro
  TagCloud.astro
  BlogPostMeta.astro
  PrevNext.astro
  RelatedPosts.astro
  TableOfContents.astro
  OgImage.tsx                   # Satori JSX component
```

### Modified Files

```
site/src/content.config.ts      # Add blog collection
site/src/components/Header.astro # Add Blog nav item
site/src/components/Footer.astro # Add Blog footer link (optional)
site/src/layouts/BaseLayout.astro # Extend with OG/meta helpers
site/package.json               # Add dependencies
```

## 12. Sample Content

Include one sample post at `site/src/content/blog/welcome.md`:

```markdown
---
title: "Welcome to the Llámenos Blog"
description: "Announcing our new blog for updates on secure crisis hotline technology."
pubDate: 2026-05-07
author: "Llámenos Team"
tags: ["announcements"]
featured: true
---

Welcome to the Llámenos blog! Here we'll share updates on our secure crisis hotline platform, security research, volunteer stories, and technical deep-dives.

Stay tuned for more.
```

## 13. Future Extensibility

The design leaves room for:
- **i18n:** Blog collection can be duplicated per-locale (`blog/en/`, `blog/es/`) when translated content is ready
- **MDX:** Can add `@astrojs/mdx` later for interactive components in posts
- **Authors collection:** Can promote `author` to a full collection with bios and avatars
- **Comments:** Can integrate giscus or similar later
- **Newsletter:** Can add signup CTA component
- **Pagination:** Can add when post count exceeds 20

## 14. Acceptance Criteria

- [ ] Blog index page renders at `/blog` with featured post, tag cloud, and post grid
- [ ] Individual posts render at `/blog/[slug]` with full content, TOC, prev/next, related posts
- [ ] Tag filter pages render at `/blog/tag/[tag]`
- [ ] RSS feed is valid and contains all non-draft posts at `/blog/rss.xml`
- [ ] OG images generate at build time for every post at `/og/blog/[slug].png`
- [ ] Every post page has complete OG, Twitter Card, and JSON-LD metadata
- [ ] Sitemap includes all blog pages
- [ ] Navigation includes "Blog" link
- [ ] Visual design matches existing site palette and typography
- [ ] Draft posts are excluded from production builds
- [ ] Sample post exists and renders correctly
- [ ] Site builds successfully with `astro build`
