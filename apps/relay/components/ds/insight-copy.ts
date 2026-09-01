/** Operator-facing banner copy. Tune tone here — the layout stays in InsightBanner. */
export function insightCopy(input: { pending: number; failed: number }): {
  kicker: string;
  body: string;
  cta: string;
  href: string;
} {
  if (input.failed > 0) {
    return {
      kicker: "Needs attention",
      body: `${input.failed} failed ${input.failed === 1 ? "send" : "sends"} in the outbox. Retry or inspect the error.`,
      cta: "Open outbox",
      href: "/dashboard/logs",
    };
  }
  if (input.pending > 0) {
    return {
      kicker: "In flight",
      body: `${input.pending} ${input.pending === 1 ? "message is" : "messages are"} waiting to drain.`,
      cta: "Open outbox",
      href: "/dashboard/logs",
    };
  }
  return {
    kicker: "Relay",
    body: "Tenants send with an API key. Track delivery from this console.",
    cta: "See tenants",
    href: "/dashboard/tenants",
  };
}
