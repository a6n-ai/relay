import { Button } from "@foundry/ui/button";
import { Link } from "@tanstack/react-router";

const FEATURES = [
  { title: "Send API", line: "Send transactional email with one authenticated request." },
  { title: "Campaigns", line: "Write once, schedule, and send to a list with a report afterwards." },
  { title: "Inbound mail", line: "Receive replies and route them to your app or your team." },
  { title: "Webhooks", line: "Get signed events for every delivery, bounce and reply." },
  { title: "Teams", line: "Invite people to a workspace and set what each can do." },
] as const;

const SAMPLE = `curl https://relay.a6n.ai/api/v1/messages \\
  -H "Authorization: Bearer $RELAY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "stream": "transactional",
    "to": "ada@example.com",
    "subject": "Welcome aboard",
    "html": "<p>Your account is ready.</p>",
    "text": "Your account is ready."
  }'`;

const Wrap = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>
);

const SignIn = ({ variant }: { variant?: "outline" }) => (
  <Button variant={variant} render={<Link to="/sign-in" search={{ redirect: undefined }} />}>
    Sign in
  </Button>
);

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <Wrap className="flex h-14 items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">Relay</span>
          <SignIn variant="outline" />
        </Wrap>
      </header>
      <main>
        <Wrap className="flex flex-col items-center gap-6 py-16 text-center sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Email, campaigns and webhooks for your apps.
          </h1>
          <p className="text-lg text-muted-foreground">One API, one console.</p>
          <SignIn />
        </Wrap>
        <Wrap>
          <div className="overflow-hidden rounded-xl border bg-card">
            <img src="/landing/console-light.png" alt="Relay console" width={1440} height={900} className="block h-auto w-full dark:hidden" />
            <img src="/landing/console-dark.png" alt="Relay console" width={1440} height={900} className="hidden h-auto w-full dark:block" />
          </div>
        </Wrap>
        <Wrap className="py-16">
          <ul className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="bg-background p-4">
                <h2 className="text-sm font-medium">{f.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{f.line}</p>
              </li>
            ))}
          </ul>
        </Wrap>
        <Wrap className="pb-16">
          <pre tabIndex={0} className="overflow-x-auto rounded-md border bg-card p-4 font-mono text-sm text-card-foreground">
            <code>{SAMPLE}</code>
          </pre>
        </Wrap>
      </main>
      <footer className="border-t">
        <Wrap className="py-6 text-sm text-muted-foreground">a6n · {new Date().getFullYear()}</Wrap>
      </footer>
    </div>
  );
}
