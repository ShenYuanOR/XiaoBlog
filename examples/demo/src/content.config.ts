import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/index.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string().min(1).max(100),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/),
      updated: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/)
        .optional(),
      description: z.string().max(200).optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).default([]),
      cover: image().optional(),
      draft: z.boolean().default(false),
      noindex: z.boolean().default(false),
      license: z.string().optional(),
    }),
});

export const collections = { posts };
