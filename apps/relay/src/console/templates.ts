import { clientFor } from "../do/client";
import { fillUnsubscribe, MERGE_SAMPLES, renderMerge, unknownMergeFields } from "../shared/merge";
import { sanitizeEmailHtml } from "../core/sanitize-html";
import { decodeCursor } from "../core/cursor";
import type { TemplateInput } from "../do/templates";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { type ConsoleActor } from "./actor";
import { getApp } from "./apps";
import { RelayError } from "../shared/errors";
import { type TemplateView } from "../shared/views";

const READ = { template: ["read"] };
const WRITE = { template: ["write"] };

function requireRead(actor: ConsoleActor): void {
  if (!allows(actor.roles, READ)) throw new RelayError("forbidden");
}
function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, WRITE)) throw new RelayError("forbidden");
  if (actor.workspaceStatus === "suspended") throw new RelayError("workspace suspended");
}

async function templateOr404(env: Env, actor: ConsoleActor, id: string): Promise<TemplateView> {
  const template = await clientFor(env, actor.workspaceId).getTemplate(actor.workspaceId, id);
  if (!template) throw new RelayError("not found");
  return template;
}

function refuseUnknownFields(bodies: (string | null | undefined)[]): void {
  for (const body of bodies) {
    if (body && unknownMergeFields(body, { data: true }).length > 0) throw new RelayError("unknown merge field");
  }
}

export async function listTemplatesFor(
  env: Env,
  actor: ConsoleActor,
  appId: string,
  cursor?: string,
): Promise<{ rows: TemplateView[]; nextCursor: string | null }> {
  requireRead(actor);
  await getApp(env, actor, appId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  return clientFor(env, actor.workspaceId).listTemplates(actor.workspaceId, appId, cursor);
}

export async function getTemplateFor(env: Env, actor: ConsoleActor, id: string): Promise<TemplateView> {
  requireRead(actor);
  return templateOr404(env, actor, id);
}

export async function createTemplateFor(env: Env, actor: ConsoleActor, appId: string, input: TemplateInput): Promise<TemplateView> {
  requireWrite(actor);
  await getApp(env, actor, appId);
  refuseUnknownFields([input.subject, input.intro, input.html, input.text]);
  const outcome = await clientFor(env, actor.workspaceId).createTemplate(actor.workspaceId, appId, input);
  if (outcome === "event_taken") throw new RelayError("template event taken");
  await writeAudit(env, { action: "template.create", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: outcome.id, data: { appId } });
  return outcome;
}

export async function updateTemplateFor(env: Env, actor: ConsoleActor, id: string, patch: Partial<TemplateInput>): Promise<TemplateView> {
  requireWrite(actor);
  await templateOr404(env, actor, id);
  refuseUnknownFields([patch.subject, patch.intro, patch.html, patch.text]);
  const outcome = await clientFor(env, actor.workspaceId).updateTemplate(actor.workspaceId, id, patch);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "event_taken") throw new RelayError("template event taken");
  await writeAudit(env, { action: "template.update", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return outcome;
}

export async function deleteTemplateFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireWrite(actor);
  const outcome = await clientFor(env, actor.workspaceId).deleteTemplate(actor.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "in_use") throw new RelayError("template in use");
  await writeAudit(env, { action: "template.delete", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}

// Data fields render as a fixed sample so the preview shows the layout, not a blank.
export async function previewTemplateFor(
  env: Env,
  actor: ConsoleActor,
  id: string,
): Promise<{ htmlSafe: string; text: string; subject: string }> {
  requireRead(actor);
  const template = await templateOr404(env, actor, id);
  const samples: Record<string, string> = { ...MERGE_SAMPLES };
  for (const body of [template.subject, template.html, template.text]) {
    for (const [, name] of body.matchAll(/\{\{\s*(data\.[a-z0-9_]+)\s*\}\}/g)) samples[name!] = "sample";
  }
  return {
    htmlSafe: sanitizeEmailHtml(fillUnsubscribe(renderMerge(template.html, samples, "html"), "#")).html,
    text: fillUnsubscribe(renderMerge(template.text, samples, "text"), "#"),
    subject: renderMerge(template.subject, samples, "subject"),
  };
}
