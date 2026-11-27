import { decodeCursor } from "../core/cursor";
import { sanitizeEmailHtml } from "@relay/email/sanitize";
import { clientFor } from "../do/client";
import type { TemplateInput, TemplateOverride } from "../do/templates";
import type { Env } from "../env";
import { RelayError } from "../shared/errors";
import { fillUnsubscribe, MERGE_SAMPLES, renderMerge, unknownMergeFields } from "../shared/merge";
import { type TemplateView } from "../shared/views";
import { audit, owned, type Principal } from "./principal";
import { ownApp } from "./apps";

function refuseUnknownFields(bodies: (string | null | undefined)[]): void {
  for (const body of bodies) {
    if (body && unknownMergeFields(body, { data: true }).length > 0) throw new RelayError("unknown merge field");
  }
}

export async function getTemplate(env: Env, p: Principal, id: string): Promise<TemplateView> {
  return owned(p, await clientFor(env, p.workspaceId).getTemplate(p.workspaceId, id));
}

export async function listTemplates(
  env: Env,
  p: Principal,
  appId: string,
  cursor?: string,
): Promise<{ rows: TemplateView[]; nextCursor: string | null }> {
  await ownApp(env, p, appId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  return clientFor(env, p.workspaceId).listTemplates(p.workspaceId, appId, cursor);
}

export async function createTemplate(env: Env, p: Principal, appId: string, input: TemplateInput): Promise<TemplateView> {
  await ownApp(env, p, appId);
  refuseUnknownFields([input.subject, input.intro, input.html, input.text]);
  const template = await clientFor(env, p.workspaceId).createTemplate(p.workspaceId, appId, input);
  await audit(env, p, "template.create", template.id, { appId });
  return template;
}

export async function updateTemplate(env: Env, p: Principal, id: string, patch: Partial<TemplateInput>): Promise<TemplateView> {
  await getTemplate(env, p, id);
  refuseUnknownFields([patch.subject, patch.intro, patch.html, patch.text]);
  const template = await clientFor(env, p.workspaceId).updateTemplate(p.workspaceId, id, patch);
  await audit(env, p, "template.update", id);
  return template;
}

export async function deleteTemplate(env: Env, p: Principal, id: string): Promise<void> {
  await getTemplate(env, p, id);
  await clientFor(env, p.workspaceId).deleteTemplate(p.workspaceId, id);
  await audit(env, p, "template.delete", id);
}

export function templateOverrides(env: Env, p: Principal): Promise<TemplateOverride[]> {
  // A key is pinned to one app; a console principal names the app per call and has none here.
  if (p.appId === null) throw new RelayError("forbidden");
  return clientFor(env, p.workspaceId).templateOverrides(p.workspaceId, p.appId);
}

// Data fields render as a fixed sample so the preview shows the layout, not a blank.
export async function previewTemplate(
  env: Env,
  p: Principal,
  id: string,
): Promise<{ htmlSafe: string; text: string; subject: string }> {
  const template = await getTemplate(env, p, id);
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
