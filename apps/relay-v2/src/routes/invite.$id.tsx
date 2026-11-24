import { Button } from "@foundry/ui/button";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getShell } from "../console/shell.fns";
import { acceptInviteFn, getInviteFn } from "../console/members.fns";
import { ROLE_LABEL, type MemberRole } from "../components/role-select";

export const Route = createFileRoute("/invite/$id")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
  },
  loader: ({ params }) => getInviteFn({ data: { id: params.id } }),
  component: InvitePage,
});

function InvitePage() {
  const { id } = Route.useParams();
  const invite = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      await acceptInviteFn({ data: { id } });
      await router.navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invite.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col justify-center gap-4 p-6">
      {!invite ? (
        <h1 className="text-lg font-medium">This invite was not found.</h1>
      ) : invite.status !== "pending" ? (
        <h1 className="text-lg font-medium">This invite is {invite.status}.</h1>
      ) : (
        <>
          <h1 className="text-lg font-medium">Join {invite.workspaceName}</h1>
          <p className="text-sm text-muted-foreground">
            You are invited as {ROLE_LABEL[invite.role as MemberRole] ?? invite.role} for {invite.email}.
          </p>
          <Button onClick={accept} disabled={pending}>
            Accept invite
          </Button>
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </main>
  );
}
