import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Pages live in src/content/docs/docs/, so the slug has no leading "docs" and the base path supplies /docs.
export const collections = {
	docs: defineCollection({ loader: glob({ base: './src/content/docs/docs', pattern: '**/*.{md,mdx}' }), schema: docsSchema() }),
};
