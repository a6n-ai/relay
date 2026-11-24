import { z } from "zod";
import type { ImportIds, ImportCampaignInput, ImportRow } from "../do/imports";
import type { ListInput } from "../do/lists";
import type { TemplateInput } from "../do/templates";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import type { KeyScope } from "./api-keys";
import { ApiError } from "./api-error";
import { clientFor } from "./messages";

export const IMPORT_MAX_ROWS = 500;

const importRef = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(120);
const listId = z.string().min(1).max(64);
const stream = z.enum(["transactional", "tracked", "marketing"]);
const count = z.number().int().min(0);
const reason = z.enum(["unsubscribe", "bounce", "complaint", "manual"]);

export const importListsSchema = z
  .array(
    z.object({
      importRef,
      name: name.max(80),
      consentSource: z.enum(["purchase", "express_optin", "event_signup", "import_other"]),
      consentNote: z.string().trim().max(500).optional(),
    }),
  )
  .max(IMPORT_MAX_ROWS);

export const importTemplatesSchema = z
  .array(
    z.object({
      importRef,
      name,
      event: z.string().trim().min(1).max(80).nullable().optional(),
      locale: z.string().trim().min(2).max(35).optional(),
      subject: z.string().max(300).optional(),
      intro: z.string().max(2000).nullable().optional(),
      html: z.string().max(500_000).optional(),
      text: z.string().max(500_000).optional(),
      enabled: z.boolean().optional(),
    }),
  )
  .max(IMPORT_MAX_ROWS);

export const importCampaignsSchema = z
  .array(
    z.object({
      importRef,
      name: name.max(80),
      status: z.enum(["draft", "sent", "cancelled"]),
      fromEmail: z.string().trim().toLowerCase().max(254).email().nullable(),
      subject: z.string().max(300),
      html: z.string().max(500_000),
      text: z.string().max(500_000),
      listIds: z.array(listId).max(50),
      counters: z
        .object({
          recipients: count,
          queued: count,
          sent: count,
          failed: count,
          suppressed: count,
          delivered: count,
          opened: count,
          clicked: count,
          bounced: count,
          complained: count,
          unsubscribed: count,
        })
        .partial()
        .optional(),
    }),
  )
  .max(IMPORT_MAX_ROWS);

export const importSuppressionsSchema = z
  .array(
    z.object({
      email: z.string().trim().toLowerCase().max(254).email(),
      reason,
      stream: stream.optional(),
    }),
  )
  .max(IMPORT_MAX_ROWS);

// Each import takes at most 500 rows and returns the ids of its refs. A ref kept by another app is refused as a conflict.
function checkedRows<T>(rows: T[]): T[] {
  if (rows.length > IMPORT_MAX_ROWS) throw new ApiError(400, "invalid input");
  return rows;
}

async function importing<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof Error && ["import ref taken", "template event taken", "bad list"].includes(err.message)) {
      throw new ApiError(409, err.message === "bad list" ? "unknown list" : err.message);
    }
    throw err;
  }
}

async function audited(env: Env, scope: KeyScope, action: string, result: ImportIds): Promise<ImportIds> {
  await writeAudit(env, { action, actorUserId: null, workspaceId: scope.workspaceId, target: scope.appId, data: { keyId: scope.keyId, created: result.created, existing: result.existing } });
  return result;
}

export async function importListsForScope(env: Env, scope: KeyScope, rows: ImportRow<ListInput>[]): Promise<ImportIds> {
  const client = clientFor(env, scope.workspaceId);
  const result = await importing(() => client.importLists(scope.workspaceId, scope.appId, checkedRows(rows)));
  return audited(env, scope, "list.import_ref", result);
}

export async function importTemplatesForScope(env: Env, scope: KeyScope, rows: ImportRow<TemplateInput>[]): Promise<ImportIds> {
  const client = clientFor(env, scope.workspaceId);
  const result = await importing(() => client.importTemplates(scope.workspaceId, scope.appId, checkedRows(rows)));
  return audited(env, scope, "template.import_ref", result);
}

export async function importCampaignsForScope(env: Env, scope: KeyScope, rows: ImportRow<ImportCampaignInput>[]): Promise<ImportIds> {
  const client = clientFor(env, scope.workspaceId);
  const result = await importing(() => client.importCampaigns(scope.workspaceId, scope.appId, checkedRows(rows)));
  return audited(env, scope, "campaign.import_ref", result);
}

export async function importSuppressionsForScope(
  env: Env,
  scope: KeyScope,
  rows: { email: string; reason: "unsubscribe" | "bounce" | "complaint" | "manual"; stream?: "transactional" | "tracked" | "marketing" }[],
): Promise<ImportIds> {
  const result = await clientFor(env, scope.workspaceId).importSuppressions(scope.workspaceId, checkedRows(rows));
  return audited(env, scope, "suppression.import", result);
}

// The brand opt-out applies when the sending address is given, so a request names its From to get the brand rule.
export function isSuppressedForScope(env: Env, scope: KeyScope, email: string, streamName: "transactional" | "tracked" | "marketing", from?: string): Promise<boolean> {
  return clientFor(env, scope.workspaceId).isSuppressed(scope.workspaceId, email, streamName, from);
}
