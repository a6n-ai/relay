import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { guardInternal } from "../../../core/internal-guard";
import { seed, seedInputSchema } from "../../../core/seed";

export const Route = createFileRoute("/api/internal/seed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardInternal(request, env.SEED_SECRET);
        if (denied) return denied;
        const body = seedInputSchema.safeParse(await request.json().catch(() => undefined));
        if (!body.success) return Response.json({ error: "invalid input" }, { status: 400 });
        return Response.json(await seed(env, body.data));
      },
    },
  },
});
