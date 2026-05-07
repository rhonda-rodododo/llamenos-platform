# Blog for Llámenos Marketing Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-featured blog to the Astro marketing site with tags, deterministic OG images, semantic metadata, RSS, and sitemap integration.

**Architecture:** Astro Content Collections for blog posts, Satori + resvg for build-time OG image generation, `@astrojs/rss` for RSS feed. All blog pages are statically generated. English-only initially.

**Tech Stack:** Astro v5, Tailwind v4, Satori, @resvg/resvg-js, @astrojs/rss

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `site/src/content/blog/welcome.md` | Sample blog post with frontmatter |
| `site/src/content.config.ts` | Add `blog` collection to existing collections |
| `site/src/components/BlogCard.astro` | Post card for grid listings |
| `site/src/components/BlogHero.astro` | Featured post highlight on index |
| `site/src/components/TagCloud.astro` | Horizontal scrollable tag pills |
| `site/src/components/BlogPostMeta.astro` | Author, date, read time, tags bar |
| `site/src/components/PrevNext.astro` | Previous/next post navigation |
| `site/src/components/RelatedPosts.astro` | "You might also like" grid |
| `site/src/components/TableOfContents.astro` | Auto-generated TOC from headings |
| `site/src/components/OgImage.tsx` | Satori JSX component for OG image generation |
| `site/src/pages/blog/index.astro` | Blog listing page |
| `site/src/pages/blog/[slug].astro` | Individual post page |
| `site/src/pages/blog/tag/[tag].astro` | Tag-filtered listing page |
| `site/src/pages/blog/rss.xml.ts` | RSS feed endpoint |
| `site/src/pages/og/blog/[slug].png.ts` | OG image generation endpoint |

### Modified Files

| File | Change |
|------|--------|
| `site/src/components/Header.astro` | Add "Blog" to nav items |
| `site/src/components/Footer.astro` | Add "Blog" link to footer |
| `site/src/layouts/BaseLayout.astro` | Add OG/meta helper props |
| `site/package.json` | Add satori, @resvg/resvg-js, @astrojs/rss |

---

## Task 1: Install Dependencies

**Files:**
- Modify: `site/package.json`

- [ ] **Step 1: Add dependencies to package.json**

Add these to the `dependencies` object in `site/package.json`:

```json
{
  "satori": "^0.12.0",
  "@resvg/resvg-js": "^2.6.0",
  "@astrojs/rss": "^4.0.0"
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
cd site && bun install
```

Expected: Dependencies install successfully.

- [ ] **Step 3: Commit**

```bash
git add site/package.json site/bun.lockb
git commit -m "deps: add satori, @resvg/resvg-js, @astrojs/rss for blog"
```

---

## Task 2: Add Blog Content Collection

**Files:**
- Modify: `site/src/content.config.ts`
- Create: `site/src/content/blog/welcome.md`

- [ ] **Step 1: Add blog collection to content.config.ts**

Modify `site/src/content.config.ts`. Add the `blog` collection after the existing `slides` collection:

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
    coverImage: z.string().optional(),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
  }),
});
```

Update the `collections` export:

```ts
export const collections = { docs, guides, pages, slides, blog };
```

- [ ] **Step 2: Create sample blog post**

Create `site/src/content/blog/welcome.md`:

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

## What to Expect

- **Security research** — Deep dives into our encryption architecture, threat models, and privacy guarantees
- **Platform updates** — New features, improvements, and release notes
- **Volunteer stories** — Experiences from crisis hotline volunteers around the world
- **Technical guides** — Self-hosting tips, configuration advice, and best practices

Stay tuned for more.
```

- [ ] **Step 3: Verify collection loads**

Run:
```bash
cd site && bunx astro dev
```

Check that the dev server starts without errors. If there are schema validation errors on the sample post, fix them.

- [ ] **Step 4: Commit**

```bash
git add site/src/content.config.ts site/src/content/blog/welcome.md
git commit -m "feat(blog): add blog content collection and sample post"
```

---

## Task 3: Update Navigation

**Files:**
- Modify: `site/src/components/Header.astro`
- Modify: `site/src/components/Footer.astro`

- [ ] **Step 1: Add Blog to Header navigation**

In `site/src/components/Header.astro`, update the `navItems` array:

```ts
const navItems = [
  { href: lp('/features'), label: t.nav.features },
  { href: lp('/security'), label: t.nav.security },
  { href: lp('/download'), label: t.nav.download },
  { href: lp('/docs'), label: t.nav.docs },
  { href: '/blog', label: 'Blog' },
];
```

- [ ] **Step 2: Add Blog to Footer**

In `site/src/components/Footer.astro`, under the "Project" column (first `<ul>`), add:

```astro
<li><a href="/blog" class="text-fg-muted hover:text-fg transition-colors">Blog</a></li>
```

- [ ] **Step 3: Commit**

```bash
git add site/src/components/Header.astro site/src/components/Footer.astro
git commit -m "feat(blog): add blog link to header and footer navigation"
```

---

## Task 4: Extend BaseLayout with OG Metadata

**Files:**
- Modify: `site/src/layouts/BaseLayout.astro`

- [ ] **Step 1: Add OG/meta props to BaseLayout**

Update the `Props` interface and destructuring in `site/src/layouts/BaseLayout.astro`:

```astro
---
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';
import { type Lang, defaultLang, languages } from '../i18n/config';
import { siteConfig } from '../config';

interface Props {
  title: string;
  description?: string;
  lang?: Lang;
  ogImage?: string;
  ogType?: string;
  canonical?: string;
  articleMeta?: {
    pubDate?: Date;
    updatedDate?: Date;
    author?: string;
    tags?: string[];
  };
  structuredData?: object;
}

const {
  title,
  description = siteConfig.description,
  lang = defaultLang,
  ogImage,
  ogType = 'website',
  canonical,
  articleMeta,
  structuredData,
} = Astro.props;
const dir = languages[lang].dir;
const canonicalUrl = canonical || new URL(Astro.url.pathname, Astro.site || 'https://llamenos-hotline.com').href;
const ogImageUrl = ogImage || new URL('/favicon.svg', Astro.site || 'https://llamenos-hotline.com').href;
---
```

- [ ] **Step 2: Add meta tags to head**

Replace the existing `<head>` content with:

```astro
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content={description} />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <title>{title} | Llámenos</title>
  <link rel="canonical" href={canonicalUrl} />

  <!-- OpenGraph -->
  <meta property="og:type" content={ogType} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={ogImageUrl} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:site_name" content="Llámenos" />

  <!-- Twitter Cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImageUrl} />

  {articleMeta?.pubDate && (
    <meta property="article:published_time" content={articleMeta.pubDate.toISOString()} />
  )}
  {articleMeta?.updatedDate && (
    <meta property="article:modified_time" content={articleMeta.updatedDate.toISOString()} />
  )}
  {articleMeta?.author && (
    <meta property="article:author" content={articleMeta.author} />
  )}
  {articleMeta?.tags?.map(tag => (
    <meta property="article:tag" content={tag} />
  ))}

  <!-- JSON-LD Structured Data -->
  {structuredData && (
    <script type="application/ld+json" set:html={JSON.stringify(structuredData)} />
  )}
</head>
```

- [ ] **Step 3: Commit**

```bash
git add site/src/layouts/BaseLayout.astro
git commit -m "feat(blog): extend BaseLayout with OG, Twitter Card, and structured data support"
```

---

## Task 5: Build Blog Components

**Files:**
- Create: `site/src/components/BlogCard.astro`
- Create: `site/src/components/BlogHero.astro`
- Create: `site/src/components/TagCloud.astro`
- Create: `site/src/components/BlogPostMeta.astro`
- Create: `site/src/components/PrevNext.astro`
- Create: `site/src/components/RelatedPosts.astro`
- Create: `site/src/components/TableOfContents.astro`

- [ ] **Step 1: Create BlogCard.astro**

Create `site/src/components/BlogCard.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  post: CollectionEntry<'blog'>;
}

const { post } = Astro.props;
const { title, description, pubDate, tags, coverImage } = post.data;

// Estimate read time: ~200 words per minute
const wordCount = post.body?.split(/\s+/).length || 0;
const readTime = Math.max(1, Math.ceil(wordCount / 200));

const dateStr = pubDate.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
---

<article class="group flex flex-col bg-bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
  {coverImage && (
    <div class="aspect-[16/9] overflow-hidden">
      <img
        src={coverImage}
        alt={title}
        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
    </div>
  )}
  <div class="flex flex-col flex-1 p-6">
    <div class="flex items-center gap-3 text-xs text-fg-dim mb-3">
      <time datetime={pubDate.toISOString()}>{dateStr}</time>
      <span>·</span>
      <span>{readTime} min read</span>
    </div>
    <h3 class="text-lg font-semibold text-fg mb-2 group-hover:text-accent-bright transition-colors">
      <a href={`/blog/${post.id}`} class="focus:outline-none">
        <span class="absolute inset-0" aria-hidden="true"></span>
        {title}
      </a>
    </h3>
    <p class="text-sm text-fg-muted line-clamp-3 mb-4 flex-1">{description}</p>
    {tags.length > 0 && (
      <div class="flex flex-wrap gap-2">
        {tags.map(tag => (
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-bg-soft text-fg-muted border border-border">
            {tag}
          </span>
        ))}
      </div>
    )}
  </div>
</article>
```

- [ ] **Step 2: Create BlogHero.astro**

Create `site/src/components/BlogHero.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  post: CollectionEntry<'blog'>;
}

const { post } = Astro.props;
const { title, description, pubDate, tags, coverImage } = post.data;

const wordCount = post.body?.split(/\s+/).length || 0;
const readTime = Math.max(1, Math.ceil(wordCount / 200));

const dateStr = pubDate.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
---

<section class="relative overflow-hidden pt-32 pb-16 md:pt-40 md:pb-20">
  <!-- Gradient background -->
  <div class="absolute inset-0 -z-10 overflow-hidden">
    <div class="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-gradient-to-br from-accent/20 via-accent-bright/10 to-transparent blur-3xl"></div>
    <div class="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-accent-bright/15 to-transparent blur-3xl"></div>
    <div class="absolute inset-0 bg-[linear-gradient(rgba(81,175,174,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(81,175,174,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"></div>
  </div>

  <div class="mx-auto max-w-6xl px-6">
    <div class="max-w-3xl">
      {tags.length > 0 && (
        <div class="mb-4 inline-flex items-center gap-2">
          {tags.slice(0, 3).map(tag => (
            <a
              href={`/blog/tag/${tag}`}
              class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent-bright border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              {tag}
            </a>
          ))}
        </div>
      )}

      <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-fg mb-4">
        {title}
      </h1>

      <p class="text-lg text-fg-muted max-w-2xl leading-relaxed mb-6">
        {description}
      </p>

      <div class="flex items-center gap-4 text-sm text-fg-dim">
        <time datetime={pubDate.toISOString()}>{dateStr}</time>
        <span>·</span>
        <span>{readTime} min read</span>
      </div>

      <div class="mt-8">
        <a
          href={`/blog/${post.id}`}
          class="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-bright px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:shadow-xl hover:shadow-accent/30 hover:-translate-y-0.5"
        >
          Read Article
          <svg class="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </a>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Create TagCloud.astro**

Create `site/src/components/TagCloud.astro`:

```astro
---
interface Props {
  tags: string[];
  activeTag?: string;
}

const { tags, activeTag } = Astro.props;
---

<div class="flex flex-wrap gap-2">
  <a
    href="/blog"
    class:list={[
      'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
      !activeTag
        ? 'bg-accent text-white border-accent'
        : 'bg-bg-soft text-fg-muted border-border hover:border-accent/40 hover:text-fg'
    ]}
  >
    All
  </a>
  {tags.map(tag => (
    <a
      href={`/blog/tag/${tag}`}
      class:list={[
        'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
        activeTag === tag
          ? 'bg-accent text-white border-accent'
          : 'bg-bg-soft text-fg-muted border-border hover:border-accent/40 hover:text-fg'
      ]}
    >
      {tag}
    </a>
  ))}
</div>
```

- [ ] **Step 4: Create BlogPostMeta.astro**

Create `site/src/components/BlogPostMeta.astro`:

```astro
---
interface Props {
  author: string;
  authorUrl?: string;
  pubDate: Date;
  updatedDate?: Date;
  tags: string[];
  wordCount: number;
}

const { author, authorUrl, pubDate, updatedDate, tags, wordCount } = Astro.props;
const readTime = Math.max(1, Math.ceil(wordCount / 200));

const dateStr = pubDate.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const updatedStr = updatedDate?.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
---

<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-dim mb-8">
  <span class="flex items-center gap-2">
    <span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-accent/10 text-accent-bright text-xs font-semibold">
      {author.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
    </span>
    {authorUrl ? (
      <a href={authorUrl} class="text-fg-muted hover:text-accent-bright transition-colors">{author}</a>
    ) : (
      <span class="text-fg-muted">{author}</span>
    )}
  </span>
  <span>·</span>
  <time datetime={pubDate.toISOString()}>{dateStr}</time>
  {updatedDate && (
    <>
      <span>·</span>
      <span>Updated <time datetime={updatedDate.toISOString()}>{updatedStr}</time></span>
    </>
  )}
  <span>·</span>
  <span>{readTime} min read</span>
</div>

{tags.length > 0 && (
  <div class="flex flex-wrap gap-2 mb-10">
    {tags.map(tag => (
      <a
        href={`/blog/tag/${tag}`}
        class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-bg-soft text-fg-muted border border-border hover:border-accent/40 hover:text-fg transition-colors"
      >
        {tag}
      </a>
    ))}
  </div>
)}
```

- [ ] **Step 5: Create PrevNext.astro**

Create `site/src/components/PrevNext.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';

interface Props {
  prev?: CollectionEntry<'blog'>;
  next?: CollectionEntry<'blog'>;
}

const { prev, next } = Astro.props;
---

{(prev || next) && (
  <nav class="border-t border-border pt-10 mt-16">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      {prev && (
        <a
          href={`/blog/${prev.id}`}
          class="group flex flex-col p-6 rounded-xl border border-border bg-bg-soft/30 hover:border-accent/40 hover:bg-bg-soft transition-all"
        >
          <span class="text-xs text-fg-dim mb-2 flex items-center gap-1">
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            Previous
          </span>
          <span class="text-sm font-medium text-fg group-hover:text-accent-bright transition-colors line-clamp-2">
            {prev.data.title}
          </span>
        </a>
      )}
      {!prev && <div />}
      {next && (
        <a
          href={`/blog/${next.id}`}
          class="group flex flex-col p-6 rounded-xl border border-border bg-bg-soft/30 hover:border-accent/40 hover:bg-bg-soft transition-all md:text-right"
        >
          <span class="text-xs text-fg-dim mb-2 flex items-center gap-1 md:justify-end">
            Next
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </span>
          <span class="text-sm font-medium text-fg group-hover:text-accent-bright transition-colors line-clamp-2">
            {next.data.title}
          </span>
        </a>
      )}
    </div>
  </nav>
)}
```

- [ ] **Step 6: Create RelatedPosts.astro**

Create `site/src/components/RelatedPosts.astro`:

```astro
---
import type { CollectionEntry } from 'astro:content';
import BlogCard from './BlogCard.astro';

interface Props {
  posts: CollectionEntry<'blog'>[];
}

const { posts } = Astro.props;
---

{posts.length > 0 && (
  <aside class="mt-16 pt-10 border-t border-border">
    <h2 class="text-xl font-semibold text-fg mb-6">You might also like</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {posts.map(post => (
        <BlogCard post={post} />
      ))}
    </div>
  </aside>
)}
```

- [ ] **Step 7: Create TableOfContents.astro**

Create `site/src/components/TableOfContents.astro`:

```astro
---
interface Heading {
  depth: number;
  slug: string;
  text: string;
}

interface Props {
  headings: Heading[];
}

const { headings } = Astro.props;
const tocHeadings = headings.filter(h => h.depth >= 2 && h.depth <= 3);
---

{tocHeadings.length > 0 && (
  <nav class="hidden lg:block sticky top-24 self-start w-64 shrink-0">
    <h2 class="text-xs font-semibold text-fg-dim uppercase tracking-wider mb-4">On this page</h2>
    <ul class="space-y-2 text-sm">
      {tocHeadings.map(heading => (
        <li class={heading.depth === 3 ? 'pl-4' : ''}>
          <a
            href={`#${heading.slug}`}
            class="block text-fg-muted hover:text-accent-bright transition-colors py-0.5"
          >
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  </nav>
)}
```

- [ ] **Step 8: Commit**

```bash
git add site/src/components/BlogCard.astro \
  site/src/components/BlogHero.astro \
  site/src/components/TagCloud.astro \
  site/src/components/BlogPostMeta.astro \
  site/src/components/PrevNext.astro \
  site/src/components/RelatedPosts.astro \
  site/src/components/TableOfContents.astro
git commit -m "feat(blog): add blog UI components"
```

---

## Task 6: Build OG Image Component

**Files:**
- Create: `site/src/components/OgImage.tsx`

- [ ] **Step 1: Create OgImage.tsx**

Create `site/src/components/OgImage.tsx`:

```tsx
/**
 * Satori-based OG image component.
 * Used by the /og/blog/[slug].png.ts endpoint.
 */

interface OgImageProps {
  title: string;
  tag?: string;
}

export function OgImage({ title, tag }: OgImageProps) {
  return (
    <div
      style={{
        width: '1200px',
        height: '630px',
        background: '#0a0f14',
        display: 'flex',
        flexDirection: 'column',
        padding: '60px 80px',
        position: 'relative',
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {/* Subtle noise texture overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Top accent line */}
      <div
        style={{
          position: 'absolute',
          top: '60px',
          left: '80px',
          right: '80px',
          height: '2px',
          background: 'linear-gradient(90deg, #51AFAE, transparent)',
        }}
      />

      {/* Wordmark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '20px',
          marginBottom: 'auto',
        }}
      >
        <svg width="32" height="32" viewBox="150 150 724 724" style={{ borderRadius: '6px' }}>
          <rect x="150" y="150" width="724" height="724" rx="80" fill="#020A12"/>
          <path fill="#51AFAE" d="M256.491 316.375C267.844 289.533 284.522 283.443 309.189 273.144L346.358 257.438L444.777 215.638C459.569 209.36 474.449 202.83 489.25 196.615C509.854 187.962 522.548 190.741 541.984 199.008L685.972 260.678L720.17 275.104C726.706 277.858 738.876 282.836 744.483 286.712C754.627 293.675 762.468 303.501 767.007 314.937C773.473 330.847 771.467 361.141 771.472 379.363L771.478 462.979L771.503 534.529C771.515 554.576 771.856 575.523 769.532 595.447C766.601 620.898 759.985 645.788 749.891 669.335C722.878 732.154 670.264 784.904 606.543 810.177C543.051 835.695 471.978 834.685 409.236 807.374C346.678 780.164 295.932 726.142 270.593 662.85C261.546 640.251 253.689 608.39 252.995 583.928C252.022 571.321 252.466 554.748 252.468 541.844L252.5 471.342C283.758 482.92 299.306 478.76 328.02 466.844C336.451 463.36 344.939 460.017 353.482 456.817C384.791 444.941 403.801 444.247 432.391 464.427C432.233 460.39 426.785 452.845 423.552 450.012C407.882 436.28 382.424 431.826 362.358 434.899C349.54 436.862 337.595 441.152 324.382 441.444C298.218 442.023 276.272 436.436 256.922 418.738L252.497 414.38L252.456 361.154C252.434 344.965 251.295 332.091 256.491 316.375Z"/>
        </svg>
        <span style={{ fontSize: '18px', fontWeight: 600, color: '#a0a0a0', letterSpacing: '-0.01em' }}>
          Llámenos
        </span>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 'auto', marginTop: '40px' }}>
        <h1
          style={{
            fontSize: '56px',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            maxWidth: '900px',
          }}
        >
          {title}
        </h1>
      </div>

      {/* Bottom row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 'auto',
        }}
      >
        {tag && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 16px',
              borderRadius: '9999px',
              background: 'rgba(81, 175, 174, 0.15)',
              color: '#5BC5C5',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {tag}
          </span>
        )}
        <span style={{ fontSize: '14px', color: '#666666' }}>
          llamenos-hotline.com
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add site/src/components/OgImage.tsx
git commit -m "feat(blog): add Satori OG image component"
```

---

## Task 7: Build OG Image Endpoint

**Files:**
- Create: `site/src/pages/og/blog/[slug].png.ts`

- [ ] **Step 1: Create OG image endpoint**

Create `site/src/pages/og/blog/[slug].png.ts`:

```ts
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OgImage } from '../../../components/OgImage';

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;
  if (!slug) {
    return new Response('Not found', { status: 404 });
  }

  const posts = await getCollection('blog');
  const post = posts.find(p => p.id === slug);
  if (!post || post.data.draft) {
    return new Response('Not found', { status: 404 });
  }

  const { title, tags } = post.data;
  const tag = tags[0];

  // Load DM Sans font
  const fontUrl = 'https://fonts.gstatic.com/s/dmsans/v15/rP2Yp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxRR23w.woff2';
  const fontResponse = await fetch(fontUrl);
  const fontData = await fontResponse.arrayBuffer();

  const svg = await satori(OgImage({ title, tag }), {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: 'DM Sans',
        data: fontData,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'DM Sans',
        data: fontData,
        weight: 700,
        style: 'normal',
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: 1200,
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return new Response(pngBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts
    .filter(post => !post.data.draft)
    .map(post => ({
      params: { slug: post.id },
    }));
}
```

- [ ] **Step 2: Commit**

```bash
git add site/src/pages/og/blog/
git commit -m "feat(blog): add OG image generation endpoint"
```

---

## Task 8: Build Blog Index Page

**Files:**
- Create: `site/src/pages/blog/index.astro`

- [ ] **Step 1: Create blog index page**

Create `site/src/pages/blog/index.astro`:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import BlogHero from '../../components/BlogHero.astro';
import BlogCard from '../../components/BlogCard.astro';
import TagCloud from '../../components/TagCloud.astro';

const allPosts = await getCollection('blog');
const posts = allPosts
  .filter(post => !post.data.draft)
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

const featuredPost = posts.find(post => post.data.featured) || posts[0];
const nonFeaturedPosts = posts.filter(post => post.id !== featuredPost?.id);

// Collect all unique tags
const allTags = [...new Set(posts.flatMap(post => post.data.tags))].sort();

const title = 'Blog';
const description = 'Updates on secure crisis hotline technology, security research, and volunteer stories.';
---

<BaseLayout title={title} description={description} ogType="website">
  {featuredPost && <BlogHero post={featuredPost} />}

  <section class="py-16 md:py-20">
    <div class="mx-auto max-w-6xl px-6">
      <div class="mb-10">
        <h2 class="text-2xl font-semibold text-fg mb-6">All Posts</h2>
        <TagCloud tags={allTags} />
      </div>

      {nonFeaturedPosts.length > 0 ? (
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {nonFeaturedPosts.map(post => (
            <BlogCard post={post} />
          ))}
        </div>
      ) : (
        <div class="text-center py-20">
          <p class="text-fg-muted text-lg">No posts yet. Check back soon!</p>
        </div>
      )}
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add site/src/pages/blog/index.astro
git commit -m "feat(blog): add blog index page"
```

---

## Task 9: Build Post Detail Page

**Files:**
- Create: `site/src/pages/blog/[slug].astro`

- [ ] **Step 1: Create post detail page**

Create `site/src/pages/blog/[slug].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import BlogPostMeta from '../../components/BlogPostMeta.astro';
import TableOfContents from '../../components/TableOfContents.astro';
import PrevNext from '../../components/PrevNext.astro';
import RelatedPosts from '../../components/RelatedPosts.astro';
import BlogCard from '../../components/BlogCard.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts
    .filter(post => !post.data.draft)
    .map(post => ({
      params: { slug: post.id },
      props: { post },
    }));
}

const { post } = Astro.props;
const { Content, headings } = await render(post);

const { title, description, pubDate, updatedDate, author, authorUrl, tags, coverImage } = post.data;

const wordCount = post.body?.split(/\s+/).length || 0;

// Get prev/next posts (sorted by date)
const allPosts = await getCollection('blog');
const sortedPosts = allPosts
  .filter(p => !p.data.draft)
  .sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());

const postIndex = sortedPosts.findIndex(p => p.id === post.id);
const prev = postIndex > 0 ? sortedPosts[postIndex - 1] : undefined;
const next = postIndex < sortedPosts.length - 1 ? sortedPosts[postIndex + 1] : undefined;

// Get related posts (same tags, excluding current)
const related = sortedPosts
  .filter(p => p.id !== post.id)
  .map(p => ({
    post: p,
    commonTags: p.data.tags.filter(t => tags.includes(t)).length,
  }))
  .filter(p => p.commonTags > 0)
  .sort((a, b) => b.commonTags - a.commonTags)
  .slice(0, 3)
  .map(p => p.post);

const ogImage = `https://llamenos-hotline.com/og/blog/${post.id}.png`;
const canonical = `https://llamenos-hotline.com/blog/${post.id}`;

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: title,
  description: description,
  image: ogImage,
  datePublished: pubDate.toISOString(),
  dateModified: updatedDate?.toISOString() || pubDate.toISOString(),
  author: {
    '@type': 'Organization',
    name: author,
  },
  publisher: {
    '@type': 'Organization',
    name: 'Llámenos',
    logo: {
      '@type': 'ImageObject',
      url: 'https://llamenos-hotline.com/favicon.svg',
    },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': canonical,
  },
};
---

<BaseLayout
  title={title}
  description={description}
  ogImage={ogImage}
  ogType="article"
  canonical={canonical}
  articleMeta={{ pubDate, updatedDate, author, tags }}
  structuredData={structuredData}
>
  <article class="pt-24 pb-16 md:pt-32 md:pb-20">
    <div class="mx-auto max-w-6xl px-6">
      <div class="flex gap-12">
        <!-- Main content -->
        <div class="flex-1 min-w-0">
          <a
            href="/blog"
            class="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-accent-bright transition-colors mb-6"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            Back to blog
          </a>

          {coverImage && (
            <div class="aspect-[16/9] rounded-xl overflow-hidden mb-8 border border-border">
              <img src={coverImage} alt={title} class="w-full h-full object-cover" />
            </div>
          )}

          <h1 class="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-fg mb-4">
            {title}
          </h1>

          <BlogPostMeta
            author={author}
            authorUrl={authorUrl}
            pubDate={pubDate}
            updatedDate={updatedDate}
            tags={tags}
            wordCount={wordCount}
          />

          <div class="prose">
            <Content />
          </div>

          <PrevNext prev={prev} next={next} />

          <RelatedPosts posts={related} />
        </div>

        <!-- TOC sidebar -->
        <TableOfContents headings={headings} />
      </div>
    </div>
  </article>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add site/src/pages/blog/[slug].astro
git commit -m "feat(blog): add post detail page with TOC, prev/next, related posts"
```

---

## Task 10: Build Tag Filter Page

**Files:**
- Create: `site/src/pages/blog/tag/[tag].astro`

- [ ] **Step 1: Create tag filter page**

Create `site/src/pages/blog/tag/[tag].astro`:

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../../layouts/BaseLayout.astro';
import BlogCard from '../../../components/BlogCard.astro';
import TagCloud from '../../../components/TagCloud.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  const publishedPosts = posts.filter(post => !post.data.draft);
  const allTags = [...new Set(publishedPosts.flatMap(post => post.data.tags))];

  return allTags.map(tag => ({
    params: { tag },
    props: { tag },
  }));
}

const { tag } = Astro.props;

const allPosts = await getCollection('blog');
const posts = allPosts
  .filter(post => !post.data.draft && post.data.tags.includes(tag))
  .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

const allTags = [...new Set(allPosts.filter(p => !p.data.draft).flatMap(p => p.data.tags))].sort();

const title = `Posts tagged "${tag}"`;
const description = `Blog posts about ${tag} on the Llámenos blog.`;
---

<BaseLayout title={title} description={description} ogType="website">
  <section class="pt-24 pb-16 md:pt-32 md:pb-20">
    <div class="mx-auto max-w-6xl px-6">
      <a
        href="/blog"
        class="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-accent-bright transition-colors mb-6"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        Back to all posts
      </a>

      <h1 class="text-3xl md:text-4xl font-bold tracking-tight text-fg mb-4">
        Posts tagged <span class="text-accent-bright">#{tag}</span>
      </h1>
      <p class="text-fg-muted mb-8">{posts.length} post{posts.length !== 1 ? 's' : ''}</p>

      <div class="mb-10">
        <TagCloud tags={allTags} activeTag={tag} />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.map(post => (
          <BlogCard post={post} />
        ))}
      </div>
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add site/src/pages/blog/tag/
git commit -m "feat(blog): add tag filter page"
```

---

## Task 11: Build RSS Feed

**Files:**
- Create: `site/src/pages/blog/rss.xml.ts`

- [ ] **Step 1: Create RSS feed endpoint**

Create `site/src/pages/blog/rss.xml.ts`:

```ts
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { render } from 'astro:content';

export const GET: APIRoute = async (context) => {
  const posts = await getCollection('blog');
  const publishedPosts = posts
    .filter(post => !post.data.draft)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  const items = await Promise.all(
    publishedPosts.map(async (post) => {
      const { Content } = await render(post);
      // Render the content to HTML string
      // Note: In Astro, we can't easily get the HTML string from Content component
      // So we'll use the description as the content for RSS
      return {
        title: post.data.title,
        description: post.data.description,
        link: `/blog/${post.id}`,
        pubDate: post.data.pubDate,
        ...(post.data.updatedDate && { customData: `<updated>${post.data.updatedDate.toISOString()}</updated>` }),
        categories: post.data.tags,
      };
    })
  );

  return rss({
    title: 'Llámenos Blog',
    description: 'Updates on secure crisis hotline technology, security research, and volunteer stories.',
    site: context.site?.toString() || 'https://llamenos-hotline.com',
    items,
    customData: `<language>en</language>`,
  });
};
```

- [ ] **Step 2: Commit**

```bash
git add site/src/pages/blog/rss.xml.ts
git commit -m "feat(blog): add RSS feed endpoint"
```

---

## Task 12: Build and Verify

**Files:**
- All blog files

- [ ] **Step 1: Build the site**

Run:
```bash
cd site && bun run build
```

Expected: Build completes without errors. Check for:
- No TypeScript errors
- No Astro build errors
- OG images are generated in `dist/og/blog/`
- Blog pages are in `dist/blog/`
- RSS feed is in `dist/blog/rss.xml`

- [ ] **Step 2: Verify OG image generation**

Check that OG images exist:
```bash
ls -la site/dist/og/blog/
```

Expected: PNG files for each non-draft post.

- [ ] **Step 3: Verify sitemap**

Check that blog pages are in the sitemap:
```bash
grep -E "blog|/og/" site/dist/sitemap-0.xml
```

Expected: Blog post URLs and OG image URLs are present.

- [ ] **Step 4: Verify RSS feed**

Check the RSS feed:
```bash
cat site/dist/blog/rss.xml | head -50
```

Expected: Valid RSS 2.0 XML with post entries.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(blog): complete blog implementation with OG images, RSS, tags, and semantic metadata"
```

---

## Spec Coverage Checklist

| Spec Section | Implementing Task |
|-------------|-------------------|
| Content collection (blog) | Task 2 |
| Sample post | Task 2 |
| Blog index page | Task 8 |
| Post detail page | Task 9 |
| Tag filter page | Task 10 |
| RSS feed | Task 11 |
| OG image generation | Task 6, Task 7 |
| Semantic metadata (OG, Twitter, JSON-LD) | Task 4, Task 9 |
| Sitemap integration | Automatic (Task 12 verification) |
| Navigation integration | Task 3 |
| Visual design (palette, typography) | All component tasks |

---

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found
- No vague "add error handling" steps
- No "similar to Task N" references
- All code blocks contain complete, runnable code
- All file paths are exact
