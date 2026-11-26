import { Badge } from "@foundry/ui/badge";
import type { CSSProperties, ReactNode } from "react";

const at = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const REQUEST: ReactNode[] = [
  <>
    <span className="ld-k">Authorization:</span> Bearer rk_test_…
  </>,
  "{",
  <>
    {"  "}
    <span className="ld-k">"stream":</span> "transactional",
  </>,
  <>
    {"  "}
    <span className="ld-k">"to":</span> "ada@example.com",
  </>,
  <>
    {"  "}
    <span className="ld-k">"subject":</span> "Welcome aboard",
  </>,
  <>
    {"  "}
    <span className="ld-k">"html":</span> "&lt;p&gt;Your account is ready.&lt;/p&gt;",
  </>,
  <>
    {"  "}
    <span className="ld-k">"text":</span> "Your account is ready."
  </>,
  "}",
];

const RESPONSE: ReactNode[] = [
  "{",
  <>
    {"  "}
    <span className="ld-k">"messageId":</span> "msg_5NCflMj5c8SF",
  </>,
  <>
    {"  "}
    <span className="ld-k">"status":</span> "queued",
  </>,
  <>
    {"  "}
    <span className="ld-k">"duplicate":</span> false
  </>,
  "}",
];

const TRAIL: { label: string; note: string; mono?: boolean }[] = [
  { label: "Queued", note: "Stored and waiting to send." },
  { label: "Sent", note: "Handed to the mail service." },
  { label: "Delivered", note: "Accepted by the recipient's server." },
  { label: "mailbox.received", note: "Mail arrives at your inbox address. Your webhook is called, signed.", mono: true },
];

export function HeroPanel() {
  return (
    <figure className="m-0 overflow-hidden rounded-md border bg-card text-card-foreground" aria-label="A send request, its response and the events that follow">
      <div className="flex items-center justify-between gap-3 border-b bg-muted px-3 py-2 sm:px-4">
        <span className="ld-code truncate font-mono">
          <span className="text-muted-foreground">POST</span> /api/v1/messages
        </span>
        <span className="ld-step shrink-0" style={at(1000)}>
          <Badge variant="success">202 Accepted</Badge>
        </span>
      </div>
      <pre tabIndex={0} className="ld-code m-0 overflow-x-auto px-3 py-3 sm:px-4" aria-label="Request">
        <code>
          {REQUEST.map((line, i) => (
            <span key={i} className="ld-step block" style={at(250 + i * 70)}>
              {line}
            </span>
          ))}
        </code>
      </pre>
      <pre tabIndex={0} className="ld-code m-0 overflow-x-auto border-t px-3 py-3 sm:px-4" aria-label="Response">
        <code>
          {RESPONSE.map((line, i) => (
            <span key={i} className="ld-step block" style={at(1150 + i * 70)}>
              {line}
            </span>
          ))}
        </code>
      </pre>
      <ol className="m-0 grid list-none gap-0 border-t bg-background p-0 px-3 py-4 sm:px-4">
        {TRAIL.map((row, i) => (
          <li key={row.label} className="ld-step ld-track grid grid-cols-[9px_1fr] items-start gap-x-3 pb-3 last:pb-0" style={at(1900 + i * 260)}>
            <span className={`ld-dot mt-[6px] ${i === TRAIL.length - 1 ? "ld-dot-live" : ""}`} aria-hidden="true" />
            <span className="grid gap-0.5 text-sm">
              <span className={row.mono ? "font-mono text-[13px]" : "font-medium"}>{row.label}</span>
              <span className="text-xs text-muted-foreground">{row.note}</span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
