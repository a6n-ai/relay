import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { resolveBearer, withinRateLimit } from "../../../core/api-keys";
import { SEND_REFUSAL_STATUS, sendMessage, sendRefusal } from "../../../core/messages";
import { sendInputSchema } from "../../../core/send-input";

export const Route = createFileRoute("/api/v1/messages")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const scope = await resolveBearer(env, request);
        if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
        if (!(await withinRateLimit(env, scope.keyId))) return Response.json({ error: "rate limited" }, { status: 429 });
        const body = sendInputSchema
          .omit({ appId: true })
          .safeParse(await request.json().catch(() => undefined));
        if (!body.success) return Response.json({ error: "invalid input" }, { status: 400 });
        try {
          return Response.json(await sendMessage(env, scope, body.data), { status: 202 });
        } catch (err) {
          const refusal = sendRefusal(err);
          if (!refusal) throw err;
          return Response.json({ error: refusal }, { status: SEND_REFUSAL_STATUS[refusal] });
        }
      },
    },
  },
});
