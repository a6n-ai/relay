import { writeAudit } from "../lib/auth/audit";
import type { KeyScope } from "./api-keys";
import { ApiError } from "./api-error";
import { clientFor } from "./messages";
import { unknownMergeFields } from "./merge";
import type { TemplateInput, TemplateOverride, TemplateView } from "../do/templates";
import type { Env } from "../env";

const audit = (env: Env, scope: KeyScope, action: string, target: string) =>
  writeAudit(env, { action, actorUserId: null, workspaceId: scope.workspaceId, target, data: { keyId: scope.keyId } });

function refuseUnknownFields(bodies: (string | null | undefined)[]): void {
  for (const body of bodies) {
    if (body && unknownMergeFields(body, { data: true }).length > 0) throw new ApiError(400, "unknown merge field");
  }
}

// A template of another app is a 404, the same as a missing one.
export async function ownedTemplate(env: Env, scope: KeyScope, id: string): Promise<TemplateView> {
  const template = await clientFor(env, scope.workspaceId).getTemplate(scope.workspaceId, id);
  if (!template || template.appId !== scope.appId) throw new ApiError(404, "not found");
  return template;
}

export function listTemplatesForScope(env: Env, scope: KeyScope, cursor?: string) {
  return clientFor(env, scope.workspaceId).listTemplates(scope.workspaceId, scope.appId, cursor);
}

export function getTemplateForScope(env: Env, scope: KeyScope, id: string): Promise<TemplateView> {
  return ownedTemplate(env, scope, id);
}

export async function createTemplateForScope(env: Env, scope: KeyScope, input: TemplateInput): Promise<TemplateView> {
  refuseUnknownFields([input.subject, input.intro, input.html, input.text]);
  const outcome = await clientFor(env, scope.workspaceId).createTemplate(scope.workspaceId, scope.appId, input);
  if (outcome === "event_taken") throw new ApiError(409, "template event taken");
  await audit(env, scope, "template.create", outcome.id);
  return outcome;
}

export async function updateTemplateForScope(env: Env, scope: KeyScope, id: string, patch: Partial<TemplateInput>): Promise<TemplateView> {
  await ownedTemplate(env, scope, id);
  refuseUnknownFields([patch.subject, patch.intro, patch.html, patch.text]);
  const outcome = await clientFor(env, scope.workspaceId).updateTemplate(scope.workspaceId, id, patch);
  if (outcome === "missing") throw new ApiError(404, "not found");
  if (outcome === "event_taken") throw new ApiError(409, "template event taken");
  await audit(env, scope, "template.update", id);
  return outcome;
}

export async function deleteTemplateForScope(env: Env, scope: KeyScope, id: string): Promise<void> {
  await ownedTemplate(env, scope, id);
  const outcome = await clientFor(env, scope.workspaceId).deleteTemplate(scope.workspaceId, id);
  if (outcome === "missing") throw new ApiError(404, "not found");
  if (outcome === "in_use") throw new ApiError(409, "template in use");
  await audit(env, scope, "template.delete", id);
}

export function templateOverridesForScope(env: Env, scope: KeyScope): Promise<TemplateOverride[]> {
  return clientFor(env, scope.workspaceId).templateOverrides(scope.workspaceId, scope.appId);
}
