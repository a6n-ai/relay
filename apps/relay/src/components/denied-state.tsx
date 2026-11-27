import { useMatch } from "@tanstack/react-router";
import type { Shell } from "../console/shell";
import { Hint, Title } from "./page/text";

export type DeniedReason = "no-workspace" | "suspended" | "not-allowed" | "not-found";

const COPY: Record<DeniedReason, { title: string; body: string }> = {
  "no-workspace": {
    title: "No workspace yet",
    body: "Ask a workspace owner to add you to a workspace, or start your own.",
  },
  suspended: {
    title: "This workspace is suspended",
    body: "Its apps, domains and members are read-only until Relay reinstates it.",
  },
  "not-allowed": {
    title: "Not available to your role",
    body: "Ask a workspace owner or admin if you need access to this page.",
  },
  "not-found": {
    title: "Not found",
    body: "It doesn't exist or isn't shared with you.",
  },
};

// Server messages that mean "you cannot see this here". Anything else is a real failure and gets the generic copy.
const DENIED = new Set(["no workspace", "forbidden", "workspace suspended", "not a member"]);

export function deniedReason(shell: Shell | undefined, message?: string): DeniedReason {
  if (shell?.active?.status === "suspended" || message === "workspace suspended") return "suspended";
  if (!shell?.active || message === "no workspace") return "no-workspace";
  return "not-allowed";
}

export function DeniedState({ reason, label }: { reason: DeniedReason; label?: string }) {
  const { title, body } = COPY[reason];
  return (
    <div role="status" className="mx-auto grid max-w-sm gap-2 p-6 text-center">
      <Title as="h2">{label ?? title}</Title>
      <Hint>{body}</Hint>
    </div>
  );
}

// Route error boundary for everything under _app. A child loader that fails renders the router default on the server, so this is also registered as defaultErrorComponent.
export function AppError({ error }: { error: unknown }) {
  // Outside _app (sign-in, invite) there is no match, so the shell is undefined and only the generic copy can show.
  const shell = useMatch({ from: "/_app", shouldThrow: false, select: (m) => m.context.shell });
  const message = error instanceof Error ? error.message : "";
  if (!DENIED.has(message)) {
    return (
      <p role="alert" className="p-6 text-sm text-destructive">
        Something went wrong. Refresh the page to try again.
      </p>
    );
  }
  return <DeniedState reason={deniedReason(shell, message)} />;
}
