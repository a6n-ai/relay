import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const d1 = await env.CENTRAL.prepare("SELECT 1").first().then(
          () => true,
          () => false,
        );
        return Response.json({ ok: true, d1 });
      },
    },
  },
});
