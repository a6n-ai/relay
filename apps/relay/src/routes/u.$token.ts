import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { unsubscribeMessage } from "../services/messages";
import { readUnsubscribeToken } from "../core/unsubscribe";

const SECURITY = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "text/html; charset=utf-8",
};

const page = (status: number, body: string) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title><body>${body}</body>`, {
    status,
    headers: SECURITY,
  });

const INVALID = "This link is not valid.";

export const Route = createFileRoute("/u/$token")({
  server: {
    handlers: {
      // Read-only: link scanners and prefetchers send GET, so only POST writes.
      GET: async ({ params }) => {
        if (!(await readUnsubscribeToken(env.UNSUBSCRIBE_SECRET, params.token))) return page(400, `<p>${INVALID}</p>`);
        return page(200, '<h1>Unsubscribe from these emails?</h1><form method="post"><button>Unsubscribe</button></form>');
      },
      POST: async ({ params, request }) => {
        const token = await readUnsubscribeToken(env.UNSUBSCRIBE_SECRET, params.token);
        if (!token) return page(400, `<p>${INVALID}</p>`);
        const limit = await env.API_LIMIT.limit({ key: `unsub:${request.headers.get("cf-connecting-ip") ?? "none"}` });
        if (!limit.success) return page(429, "<p>Too many requests. Try again later.</p>");
        await unsubscribeMessage(env, token.workspaceId, token.messageId);
        return page(200, "<h1>You are unsubscribed.</h1>");
      },
    },
  },
});
