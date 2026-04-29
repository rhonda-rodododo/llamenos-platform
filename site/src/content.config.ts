import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    guidesHeading: z.string().optional(),
    guides: z.array(z.object({
      title: z.string(),
      description: z.string(),
      href: z.string(),
    })).optional(),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    audience: z.array(z.string()).optional(),
    task: z.array(z.string()).optional(),
    feature: z.string().optional(),
    order: z.number().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    description: z.string().optional(),
  }),
});

const slides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/slides' }),
  schema: z.object({
    title: z.string(),
    author: z.string().optional(),
    date: z.coerce.date().optional(),
    event: z.string().optional(),
    description: z.string().optional(),
    theme: z.string().optional().default('dark'),
  }),
});

export const collections = { docs, guides, pages, slides };
