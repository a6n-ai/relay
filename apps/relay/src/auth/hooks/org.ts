import { APIError } from "better-auth/api";
import { countSelfServeCreatedBy, ensureWorkspaceProfile, inviteCap, invitesInWindow, SELF_SERVE_WORKSPACE_CAP } from "../../core/workspace-profile";
import { workspaceHoldings } from "../../core/workspace-holdings";
import { maskEmails } from "../../core/mask-emails";
import type { Env } from "../../env";
import { writeAudit } from "../audit";

// Guards and audit rows for the organization plugin (a workspace is an organization).
export const organizationHooks = (env: Env) => ({
  beforeCreateOrganization: async ({ user }: { user: { role?: string | null } & { id: string } }) => {
    if (user.role === "admin") return;
    // N parallel creates can all pass this check. shortcut: parallel creates can exceed the cap, add an atomic counter if abuse appears
    if ((await countSelfServeCreatedBy(env, user.id)) >= SELF_SERVE_WORKSPACE_CAP)
      throw new APIError("FORBIDDEN", { message: `You can create up to ${SELF_SERVE_WORKSPACE_CAP} workspaces` });
  },
  beforeDeleteOrganization: async ({ organization }: { organization: { id: string } }) => {
    const held = await workspaceHoldings(env, organization.id);
    if (held.apps) throw new APIError("BAD_REQUEST", { message: "workspace still has apps" });
    if (held.addresses) throw new APIError("BAD_REQUEST", { message: "workspace still has addresses" });
    if (held.domains) throw new APIError("BAD_REQUEST", { message: "workspace still has sending domains" });
  },
  afterCreateOrganization: async ({ organization, user }: { organization: { id: string }; user: { id: string; role?: string | null } }) => {
    try {
      await ensureWorkspaceProfile(env, organization.id, { selfServe: user.role !== "admin", createdBy: user.id });
    } catch (error) {
      // Repair-on-read creates the missing profile later.
      console.error(`workspace profile failed: workspace.create: ${error instanceof Error ? error.message : String(error)}`);
    }
    await writeAudit(env, { action: "workspace.create", actorUserId: user.id, workspaceId: organization.id, target: organization.id });
  },
  afterDeleteOrganization: async ({ organization, user }: { organization: { id: string }; user: { id: string } }) => {
    await writeAudit(env, { action: "workspace.delete", actorUserId: user.id, workspaceId: organization.id, target: organization.id });
  },
  // Here, not only in the console: /api/auth/organization/invite-member is reachable over HTTP and mails from Relay's sender.
  beforeCreateInvitation: async ({ organization }: { organization: { id: string } }) => {
    if ((await invitesInWindow(env, organization.id)) >= (await inviteCap(env, organization.id)))
      throw new APIError("TOO_MANY_REQUESTS", { message: "invite limit reached" });
  },
  afterCreateInvitation: async ({ invitation, inviter, organization }: { invitation: { email: string; role: string }; inviter: { id: string }; organization: { id: string } }) => {
    await writeAudit(env, { action: "invite.create", actorUserId: inviter.id, workspaceId: organization.id, target: maskEmails(invitation.email), data: { role: invitation.role } });
  },
  afterAcceptInvitation: async ({ invitation, user, organization }: { invitation: { email: string }; user: { id: string }; organization: { id: string } }) => {
    await writeAudit(env, { action: "invite.accept", actorUserId: user.id, workspaceId: organization.id, target: maskEmails(invitation.email) });
  },
  afterCancelInvitation: async ({ invitation, cancelledBy, organization }: { invitation: { email: string }; cancelledBy: { id: string }; organization: { id: string } }) => {
    await writeAudit(env, { action: "invite.cancel", actorUserId: cancelledBy.id, workspaceId: organization.id, target: maskEmails(invitation.email) });
  },
  afterAddMember: async ({ member, user, organization }: { member: { role: string }; user: { id: string }; organization: { id: string } }) => {
    await writeAudit(env, { action: "member.add", workspaceId: organization.id, target: user.id, data: { role: member.role } });
  },
  afterRemoveMember: async ({ user, organization }: { user: { id: string }; organization: { id: string } }) => {
    await writeAudit(env, { action: "member.remove", workspaceId: organization.id, target: user.id });
  },
});
