import { useRef, useState, type KeyboardEvent } from "react";
import { DOCS_BASE, SITE_ORIGIN } from "../../shared/site";

const CURL = `curl ${SITE_ORIGIN}/api/v1/messages \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "stream": "transactional",
    "to": "ada@northwind.test",
    "subject": "Welcome aboard",
    "html": "<p>Your account is ready.</p>",
    "text": "Your account is ready."
  }'`;

const NODE = `const res = await fetch("${SITE_ORIGIN}/api/v1/messages", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.RELAY_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    stream: "transactional",
    to: "ada@northwind.test",
    subject: "Welcome aboard",
    html: "<p>Your account is ready.</p>",
    text: "Your account is ready.",
  }),
});
// 202: { messageId: "msg_…", status: "queued", duplicate: false }
const { messageId } = await res.json();`;

const PYTHON = `import os
import requests

res = requests.post(
    "${SITE_ORIGIN}/api/v1/messages",
    headers={"Authorization": f"Bearer {os.environ['RELAY_API_KEY']}"},
    json={
        "stream": "transactional",
        "to": "ada@northwind.test",
        "subject": "Welcome aboard",
        "html": "<p>Your account is ready.</p>",
        "text": "Your account is ready.",
    },
)
# 202: {"messageId": "msg_…", "status": "queued", "duplicate": false}
print(res.json()["messageId"])`;

const WORKER = `// wrangler.jsonc
"services": [
  { "binding": "RELAY", "service": "relay", "entrypoint": "RelayRpc" }
]

// worker.ts
const sent = await env.RELAY.send(env.RELAY_API_KEY, {
  stream: "transactional",
  to: "ada@northwind.test",
  subject: "Welcome aboard",
  html: "<p>Your account is ready.</p>",
  text: "Your account is ready.",
});
// { messageId: "msg_…", status: "queued", duplicate: false }`;

const TABS = [
  { id: "curl", label: "curl", code: CURL, href: `${DOCS_BASE}/api/messages/`, link: "Messages reference" },
  { id: "node", label: "Node", code: NODE, href: `${DOCS_BASE}/api/messages/`, link: "Messages reference" },
  { id: "python", label: "Python", code: PYTHON, href: `${DOCS_BASE}/api/messages/`, link: "Messages reference" },
  { id: "worker", label: "Worker binding", code: WORKER, href: `${DOCS_BASE}/worker-binding/`, link: "Worker binding guide" },
] as const;

export function DevTabs() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + TABS.length) % TABS.length;
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="overflow-hidden rounded-md border bg-card text-card-foreground">
      <div role="tablist" aria-label="Language" onKeyDown={onKey} className="flex overflow-x-auto border-b bg-muted">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === i}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-ring ${
              active === i ? "border-foreground text-foreground hover:bg-background" : "border-transparent text-muted-foreground hover:border-border hover:bg-background"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t, i) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== i}>
          <pre tabIndex={0} className="ld-code m-0 overflow-x-auto p-3 sm:p-4">
            <code>{t.code}</code>
          </pre>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
            <span>Test values only. Replace the key and addresses with your own.</span>
            <a href={t.href} className="ld-link inline-flex min-h-6 items-center gap-1 font-medium text-foreground">
              {t.link}
              <span aria-hidden="true" className="ld-arrow">
                →
              </span>
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
