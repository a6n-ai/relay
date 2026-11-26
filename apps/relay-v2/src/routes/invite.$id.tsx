import { Button } from "@foundry/ui/button";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getShell } from "../console/shell.fns";
import { acceptInviteFn, getInviteFn } from "../console/members.fns";
import { AuthCard } from "../components/auth-card";
import { errorText } from "../components/error-text";
import { FormError } from "../components/page/form-parts";
import { ROLE_LABEL, type MemberRole } from "../components/role-select";
import { SignOutButton } from "../components/sign-out-button";
import { Hint, Title } from "../components/page/text";

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
      setError(errorText(err, "Could not accept the invite."));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard>
      {!invite ? (
        <Title>This invite was not found.</Title>
      ) : invite.state === "other-email" ? (
        <>
          <Title>This invite is for a different email address.</Title>
          <SignOutButton />
        </>
      ) : invite.state === "suspended" ? (
        <Title>This workspace is suspended, so the invite cannot be accepted.</Title>
      ) : invite.status !== "pending" ? (
        <Title>This invite is {invite.status}.</Title>
      ) : (
        <>
          <Title>Join {invite.workspaceName}</Title>
          <Hint>
            You are invited as {ROLE_LABEL[invite.role as MemberRole] ?? invite.role} for {invite.email}.
          </Hint>
          <Button onClick={accept} disabled={pending}>
            Accept invite
          </Button>
        </>
      )}
      <FormError message={error} />
    </AuthCard>
  );
}
