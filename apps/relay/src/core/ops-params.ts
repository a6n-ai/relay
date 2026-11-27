import { z } from "zod";

export type SeedInput = {
  ownerEmails: string[];
  workspace: { name: string; slug: string };
  app: { name: string; slug: string };
  domain?: { domain: string; sesRegion: string };
};

const text = z.string().min(1);
export const seedInputSchema = z.object({
  ownerEmails: z.array(z.string().trim().toLowerCase().pipe(z.email())).min(1),
  workspace: z.object({ name: text, slug: text }),
  app: z.object({ name: text, slug: text }),
  domain: z.object({ domain: text, sesRegion: text }).optional(),
});

// Operator jobs started with `wrangler workflows trigger relay-ops '<json>'`. They run inside Cloudflare, so they
// work from networks whose proxy blocks scripted HTTPS to relay.a6n.ai, and starting one needs Cloudflare account
// access rather than a bearer secret on a public route.
export const opsParamsSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("seed"), input: seedInputSchema }),
  z.object({ op: z.literal("sweep") }),
]);
export type OpsParams = z.input<typeof opsParamsSchema>;
