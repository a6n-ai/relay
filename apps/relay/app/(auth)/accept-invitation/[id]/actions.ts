"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

type Result = { error?: string };

// Better Auth messages for the two refusals the accept page can show; see organization/routes/crud-invites.
function acceptError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.includes("You are not the recipient of the invitation")) return "This invite is for a different email";
  if (message.includes("Invitation not found")) return "This invite has expired or was already used";
  return "Could not accept the invite";
}

export async function acceptInvitationAction(invitationId: string): Promise<Result> {
  try {
    await auth.api.acceptInvitation({ headers: await headers(), body: { invitationId } });
  } catch (err) {
    return { error: acceptError(err) };
  }
  return {};
}
