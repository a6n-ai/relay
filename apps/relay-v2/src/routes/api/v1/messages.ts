import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer } from "../../../core/api-keys";
import { sendMessage } from "../../../core/messages";
import { sendInputSchema } from "../../../core/send-input";

export const Route = createFileRoute("/api/v1/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        const body = sendInputSchema
          .omit({ appId: true })
          .safeParse(await request.json().catch(() => undefined));
        if (!body.success) return Response.json({ error: "invalid input" }, { status: 400 });
        return Response.json(await sendMessage(env, scope, body.data), { status: 202 });
      },
    },
  },
});
