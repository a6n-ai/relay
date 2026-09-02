/** Operator-facing banner copy. Tune tone here — the layout stays in InsightBanner. */
export function insightCopy(input: { pending: number; failed: number }): {
  kicker: string;
  body: string;
  cta: string;
  href: string;
} {
  if (input.failed > 0) {
    return {
      kicker: "Needs a look",
      body: `${input.failed} ${input.failed === 1 ? "message didn’t send" : "messages didn’t send"}. Open Sends to retry or see why.`,
      cta: "Open Sends",
      href: "/dashboard/logs",
    };
  }
  if (input.pending > 0) {
    return {
      kicker: "On the way",
      body: `${input.pending} ${input.pending === 1 ? "message is" : "messages are"} waiting to go out.`,
      cta: "Open Sends",
      href: "/dashboard/logs",
    };
  }
  return {
    kicker: "Relay",
    body: "Each app (Tiffin Grab, Realm) sends its own messages. Watch delivery here.",
    cta: "See apps",
    href: "/dashboard/tenants",
  };
}
