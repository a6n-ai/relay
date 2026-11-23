import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const ping = (db: D1Database) =>
          db.prepare("SELECT 1").first().then(
            () => true,
            () => false,
          );
        const d1 = (await Promise.all([ping(env.SECURITY_DB), ping(env.CORE_DB)])).every(Boolean);
        return Response.json({ ok: true, d1 });
      },
    },
  },
});
