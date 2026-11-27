import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getShell } from "../console/shell.fns";
import { signInRedirect } from "../components/lib/sign-in-redirect";
import { acceptInviteFn, getInviteFn } from "../console/members.fns";
import { AuthButton, AuthCard, AuthText, AuthTitle } from "../components/auth-card";
import { FormError } from "../components/page/form-parts";
import { ROLE_LABEL, type OrgRole } from "../shared/roles";
import { useSignOut } from "../components/sign-out-button";
import { useSubmit } from "../components/use-submit";

export const Route = createFileRoute("/invite/$id")({
  beforeLoad: async ({ location }) => {
    const shell = await getShell();
    if (!shell) throw signInRedirect(location);
  },
  loader: ({ params }) => getInviteFn({ data: { id: params.id } }),
  component: InvitePage,
});

function InvitePage() {
  const { id } = Route.useParams();
  const invite = Route.useLoaderData();
  const router = useRouter();
  const signOut = useSignOut();
  const { pending, error, setError, run } = useSubmit();

  async function accept() {
    await run(async () => {
      await acceptInviteFn({ data: { id } });
      await router.navigate({ to: "/" });
    }, "Could not accept the invite.");
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
