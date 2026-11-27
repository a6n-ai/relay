import { clientFor } from "../do/client";
import { getWorkspaceProfile } from "../core/workspace-profile";
import type { AutomationInput, AutomationPatch } from "../do/automations";
import type { Env } from "../env";
import { audit, type Principal } from "./principal";
import { getApp } from "./apps";
import { verifiedSenders } from "./campaign-run";
import { RelayError } from "../shared/errors";
import { type AutomationView } from "../shared/views";

async function requireVerifiedSender(env: Env, p: Principal, appId: string, fromEmail: string): Promise<void> {
  if (!(await verifiedSenders(env, p.workspaceId, appId)).includes(fromEmail)) throw new RelayError("sender not verified");
}

// Audit rows carry the automation id and counts only, never a contact address.
export async function listAutomations(env: Env, p: Principal, appId: string): Promise<AutomationView[]> {
  await getApp(env, p, appId);
  return clientFor(env, p.workspaceId).listAutomations(p.workspaceId, appId);
}

// Looked up across the workspace, then the app check keeps an app hidden from this reader hidden.
export async function getAutomation(env: Env, p: Principal, id: string): Promise<AutomationView> {
  const found = (await clientFor(env, p.workspaceId).listAutomations(p.workspaceId)).find((a) => a.id === id);
  if (!found) throw new RelayError("not found");
  await getApp(env, p, found.appId);
  return found;
}

export async function createAutomation(env: Env, p: Principal, appId: string, input: AutomationInput): Promise<AutomationView> {
  await getApp(env, p, appId);
  await requireVerifiedSender(env, p, appId, input.fromEmail);
  const automation = await clientFor(env, p.workspaceId).createAutomation(p.workspaceId, appId, input);
  await audit(env, p, "automation.create", automation.id, { appId });
  return automation;
}

export async function updateAutomation(env: Env, p: Principal, id: string, patch: AutomationPatch): Promise<AutomationView> {
  const client = clientFor(env, p.workspaceId);
  if (patch.fromEmail !== undefined) {
    const current = (await client.listAutomations(p.workspaceId)).find((a) => a.id === id);
    if (!current) throw new RelayError("not found");
    await requireVerifiedSender(env, p, current.appId, patch.fromEmail);
  }
  const automation = await client.updateAutomation(p.workspaceId, id, patch);
  await audit(env, p, "automation.update", id);
  return automation;
}

export async function enableAutomation(env: Env, p: Principal, id: string, on: boolean): Promise<AutomationView> {
  const profile = await getWorkspaceProfile(env, p.workspaceId);
  const outcome = await clientFor(env, p.workspaceId).setAutomationEnabled(p.workspaceId, id, on, profile.physicalAddress ?? null);
  if ("problems" in outcome) {
    // Automations send to lists, so {{data.*}} fields can never fill; say so instead of the generic checklist.
    if (outcome.problems.includes("data_fields_need_hook")) throw new RelayError("automation uses data fields");
    throw new RelayError("automation not ready");
  }
  await audit(env, p, on ? "automation.enable" : "automation.disable", id);
  return outcome;
}

export async function deleteAutomation(env: Env, p: Principal, id: string): Promise<void> {
  await clientFor(env, p.workspaceId).deleteAutomation(p.workspaceId, id);
  await audit(env, p, "automation.delete", id);
}
