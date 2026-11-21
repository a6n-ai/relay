import type { Metadata } from "next";
import { Card, CardContent } from "@foundry/ui/card";
import { loadOpenInvite } from "@/lib/auth/invites";
import { getSession } from "@/lib/auth/session";
import { AcceptInviteButton, SignInForInvite } from "./accept-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Accept invite" };

export default async function AcceptInvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invite = await loadOpenInvite(id);
  if (!invite) {
    return (
      <Card>
        <CardContent className="p-6 md:p-8">
          <p className="text-sm">This invite has expired or was already used</p>
        </CardContent>
      </Card>
    );
  }

  const session = await getSession();
  const signedInEmail = session?.user.email.toLowerCase();
  let action: React.ReactNode;
  if (!session) {
    action = <SignInForInvite email={invite.email} />;
  } else if (signedInEmail === invite.email) {
    action = <AcceptInviteButton invitationId={invite.id} />;
  } else {
    action = <p className="text-sm">This invite is for {invite.email}. Sign out to accept it.</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">You’re invited to {invite.workspaceName}</h1>
          <p className="text-muted-foreground text-sm">{invite.email}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
