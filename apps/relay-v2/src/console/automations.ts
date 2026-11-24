import { clientFor } from "../core/messages";
import { getWorkspaceProfile } from "../core/workspace-profile";
import type { AutomationInput, AutomationPatch, AutomationView } from "../do/automations";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { ConsoleError, type ConsoleActor } from "./actor";
import { getApp } from "./apps";
import { verifiedSenders } from "./campaigns";

const READ = { campaign: ["read"] };
const SEND = { campaign: ["send"] };

function requireRead(actor: ConsoleActor): void {
  if (!allows(actor.roles, READ)) throw new ConsoleError(403, "forbidden");
}

function requireSend(actor: ConsoleActor): void {
  if (!allows(actor.roles, SEND)) throw new ConsoleError(403, "forbidden");
  if (actor.workspaceStatus === "suspended") throw new ConsoleError(403, "workspace suspended");
}

async function requireVerifiedSender(env: Env, actor: ConsoleActor, appId: string, fromEmail: string): Promise<void> {
  if (!(await verifiedSenders(env, actor.workspaceId, appId)).includes(fromEmail)) throw new ConsoleError(400, "sender not verified");
}

// Audit rows carry the automation id and counts only, never a contact address.
export async function listAutomationsFor(env: Env, actor: ConsoleActor, appId: string): Promise<AutomationView[]> {
  requireRead(actor);
  await getApp(env, actor, appId);
  return clientFor(env, actor.workspaceId).listAutomations(actor.workspaceId, appId);
}

export async function createAutomationFor(env: Env, actor: ConsoleActor, appId: string, input: AutomationInput): Promise<AutomationView> {
  requireSend(actor);
  await getApp(env, actor, appId);
  await requireVerifiedSender(env, actor, appId, input.fromEmail);
  const outcome = await clientFor(env, actor.workspaceId).createAutomation(actor.workspaceId, appId, input);
  if (outcome === "bad_list" || outcome === "bad_template") throw new ConsoleError(400, "not found");
  await writeAudit(env, {
    action: "automation.create",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: outcome.id,
    data: { appId },
  });
  return outcome;
}

export async function updateAutomationFor(env: Env, actor: ConsoleActor, id: string, patch: AutomationPatch): Promise<AutomationView> {
  requireSend(actor);
  const client = clientFor(env, actor.workspaceId);
  if (patch.fromEmail !== undefined) {
    const current = (await client.listAutomations(actor.workspaceId)).find((a) => a.id === id);
    if (!current) throw new ConsoleError(404, "not found");
    await requireVerifiedSender(env, actor, current.appId, patch.fromEmail);
  }
  const outcome = await client.updateAutomation(actor.workspaceId, id, patch);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  if (outcome === "bad_template") throw new ConsoleError(400, "not found");
  await writeAudit(env, { action: "automation.update", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return outcome;
}

export async function enableAutomationFor(env: Env, actor: ConsoleActor, id: string, on: boolean): Promise<AutomationView> {
  requireSend(actor);
  const profile = await getWorkspaceProfile(env, actor.workspaceId);
  const outcome = await clientFor(env, actor.workspaceId).setAutomationEnabled(actor.workspaceId, id, on, profile.physicalAddress ?? null);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  if ("problems" in outcome) throw new ConsoleError(409, "automation not ready");
  await writeAudit(env, {
    action: on ? "automation.enable" : "automation.disable",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: id,
  });
  return outcome;
}

export async function deleteAutomationFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireSend(actor);
  const outcome = await clientFor(env, actor.workspaceId).deleteAutomation(actor.workspaceId, id);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  await writeAudit(env, { action: "automation.delete", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}
