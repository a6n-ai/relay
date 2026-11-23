import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { sesEventJobFrom } from "../../../core/ses-events";
import { snsHostUrl, snsMessageSchema, snsRegion, verifySnsMessage } from "../../../core/sns";

export const Route = createFileRoute("/api/webhooks/ses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = snsMessageSchema.safeParse(await request.json().catch(() => undefined));
        if (!parsed.success) return Response.json({ error: "invalid input" }, { status: 400 });
        const msg = parsed.data;

        const allowed = (env.SES_EVENT_TOPIC_ARNS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        if (allowed.length === 0) return Response.json({ error: "not configured" }, { status: 503 });
        // Topic before signature: a foreign topic never costs a cert fetch.
        if (!allowed.includes(msg.TopicArn)) return Response.json({ error: "unexpected topic" }, { status: 403 });
        if (!(await verifySnsMessage(msg))) return Response.json({ error: "invalid signature" }, { status: 403 });

        if (msg.Type === "SubscriptionConfirmation") {
          const url = msg.SubscribeURL ? snsHostUrl(msg.SubscribeURL, snsRegion(msg.TopicArn)) : null;
          if (url && !(await fetch(url.href, { redirect: "error" })).ok) {
            return Response.json({ error: "confirmation failed" }, { status: 502 });
          }
        }
        if (msg.Type === "Notification") {
          const job = sesEventJobFrom(msg.MessageId, msg.Message);
          if (job) await env.SES_EVENTS.send(job);
          else console.warn("ses webhook: dropped notification", msg.MessageId);
        }
        return new Response(null, { status: 200 });
      },
    },
  },
});
