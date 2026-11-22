const SAMPLE = `curl -X POST https://relay.a6n.ai/v1/messages \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
  "event": "order.paid",
  "title": "Order paid",
  "body": "Thanks — we have your order.",
  "to": { "email": "ops@example.com" },
  "channels": ["email"]
}'`;

/** A static request to the send API, as a developer would copy it. */
export function CodeSample() {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-card p-5 font-mono text-xs leading-6 text-muted-foreground">
      <code>{SAMPLE}</code>
    </pre>
  );
}
