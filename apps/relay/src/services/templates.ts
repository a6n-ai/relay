import { decodeCursor } from "../core/cursor";
import { sanitizeEmailHtml } from "../core/sanitize-html";
import { clientFor } from "../do/client";
import type { TemplateInput, TemplateOverride } from "../do/templates";
import type { Env } from "../env";
import { RelayError } from "../shared/errors";
import { fillUnsubscribe, MERGE_SAMPLES, renderMerge, unknownMergeFields } from "../shared/merge";
import { type TemplateView } from "../shared/views";
import { appFor, audit, keyApp, owned, type Principal } from "./principal";

function refuseUnknownFields(bodies: (string | null | undefined)[]): void {
  for (const body of bodies) {
    if (body && unknownMergeFields(body, { data: true }).length > 0) throw new RelayError("unknown merge field");
  }
}

async function ownedTemplate(env: Env, p: Principal, id: string): Promise<TemplateView> {
  return owned(p, await clientFor(env, p.workspaceId).getTemplate(p.workspaceId, id));
}

export async function listTemplates(
  env: Env,
  p: Principal,
  appId: string,
  cursor?: string,
): Promise<{ rows: TemplateView[]; nextCursor: string | null }> {
  await appFor(env, p, appId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  return clientFor(env, p.workspaceId).listTemplates(p.workspaceId, appId, cursor);
}

export const getTemplate = ownedTemplate;

export async function createTemplate(env: Env, p: Principal, appId: string, input: TemplateInput): Promise<TemplateView> {
  await appFor(env, p, appId);
  refuseUnknownFields([input.subject, input.intro, input.html, input.text]);
  const outcome = await clientFor(env, p.workspaceId).createTemplate(p.workspaceId, appId, input);
  if (outcome === "event_taken") throw new RelayError("template event taken");
  await audit(env, p, "template.create", outcome.id, { appId });
  return outcome;
}

export async function updateTemplate(env: Env, p: Principal, id: string, patch: Partial<TemplateInput>): Promise<TemplateView> {
  await ownedTemplate(env, p, id);
  refuseUnknownFields([patch.subject, patch.intro, patch.html, patch.text]);
  const outcome = await clientFor(env, p.workspaceId).updateTemplate(p.workspaceId, id, patch);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "event_taken") throw new RelayError("template event taken");
  await audit(env, p, "template.update", id);
  return outcome;
}

export async function deleteTemplate(env: Env, p: Principal, id: string): Promise<void> {
  await ownedTemplate(env, p, id);
  const outcome = await clientFor(env, p.workspaceId).deleteTemplate(p.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "in_use") throw new RelayError("template in use");
  await audit(env, p, "template.delete", id);
}

export function templateOverrides(env: Env, p: Principal): Promise<TemplateOverride[]> {
  const appId = keyApp(p);
  return clientFor(env, p.workspaceId).templateOverrides(p.workspaceId, appId);
}

// Data fields render as a fixed sample so the preview shows the layout, not a blank.
export async function previewTemplate(
  env: Env,
  p: Principal,
  id: string,
): Promise<{ htmlSafe: string; text: string; subject: string }> {
  const template = await ownedTemplate(env, p, id);
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
