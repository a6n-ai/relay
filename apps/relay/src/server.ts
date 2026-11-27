import { env } from "cloudflare:workers";
import handler from "@tanstack/react-start/server-entry";
import { DOCS_404_PATH, isDocsMiss } from "./docs-404";
import { receiveEmail } from "./jobs/email-worker";
import { handleQueue } from "./jobs/queues";
import { sweepAll } from "./jobs/sweep-all";
import type { Env } from "./env";

export { CampaignWorkflow } from "./jobs/campaign-workflow";
export { OpsWorkflow } from "./jobs/ops-workflow";
export { ClientDO } from "./do/client-do";
export { RelayRpc } from "./rpc/relay-rpc";

// A path under /docs that no static file matched shows the docs 404 page, not the console's.
async function fetchWithDocs404(...args: Parameters<typeof handler.fetch>): Promise<Response> {
  const res = await handler.fetch(...args);
  const request = args[0] as Request;
  if (!isDocsMiss(new URL(request.url).pathname, res.status)) return res;
  const page = await env.ASSETS.fetch(new URL(DOCS_404_PATH, request.url));
  return page.status === 200 ? new Response(page.body, { status: 404, headers: page.headers }) : res;
}

// No other site, including another *.a6n.ai page, may frame the console. A route that sets its own value keeps it.
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": "frame-ancestors 'self'",
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

async function withSecurityHeaders(...args: Parameters<typeof handler.fetch>): Promise<Response> {
  const res = await fetchWithDocs404(...args);
  // A 101 upgrade cannot be rebuilt, and asset and fetch responses have immutable headers.
  if (res.status === 101) return res;
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(name)) out.headers.set(name, value);
  return out;
}

export default {
  fetch: withSecurityHeaders,
  email: receiveEmail,
  async scheduled(_controller: ScheduledController, env: Env) {
    const result = await sweepAll(env);
    console.log(`daily sweep: ${result.total} workspaces, ${result.behind.length} behind, ${result.failed.length} failed, ${result.releasedDomains} domains released`);
  },
  queue: handleQueue,
};
