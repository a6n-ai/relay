import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { getShell } from "../console/shell.fns";
import { acceptInviteFn, getInviteFn } from "../console/members.fns";
import { AuthButton, AuthCard, AuthText, AuthTitle } from "../components/auth-card";
import { errorText } from "../components/error-text";
import { FormError } from "../components/page/form-parts";
import { ROLE_LABEL, type OrgRole } from "../shared/roles";
import { useSignOut } from "../components/sign-out-button";

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
  const signOut = useSignOut();
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
        <>
          <AuthTitle>This invite was not found.</AuthTitle>
          <AuthButton variant="outline" render={<Link to="/sign-in" search={{ redirect: undefined }} />}>
            Back to sign in
          </AuthButton>
        </>
      ) : invite.state === "other-email" ? (
        <>
          <AuthTitle>This invite is for a different email address.</AuthTitle>
          <AuthButton variant="outline" onClick={signOut}>
            Sign out
          </AuthButton>
        </>
      ) : invite.state === "suspended" ? (
        <AuthTitle>This workspace is suspended, so the invite cannot be accepted.</AuthTitle>
      ) : invite.status !== "pending" ? (
        <AuthTitle>This invite is {invite.status}.</AuthTitle>
      ) : (
        <>
          <AuthTitle>Join {invite.workspaceName}</AuthTitle>
          <AuthText>
            You are invited as {ROLE_LABEL[invite.role as OrgRole] ?? invite.role} for {invite.email}.
          </AuthText>
          <AuthButton onClick={accept} disabled={pending}>
            Accept invite
          </AuthButton>
        </>
      )}
      <FormError message={error} />
    </AuthCard>
  );
}
