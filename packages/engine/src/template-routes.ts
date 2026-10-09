import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import { prepareEmailContent } from "./email-content";
import type { NotificationTables } from "./schema";
import type { CompatWarning } from "./ui/email-compat";

export const saveEmailTemplateSchema = z.object({
  event: z.string().min(1),
  locale: z.string().min(1),
  subject: z.string().trim().min(1).max(200),
  body: z.string().max(524288),
  html: z.string().min(1).max(524288),
  preheader: z.string().max(300).default(""),
  enabled: z.boolean(),
  revision: z.number().int().min(0).default(0),
});
export type SaveEmailTemplateInput = z.infer<typeof saveEmailTemplateSchema>;

type Result = { revision: number; removed: string[]; lint: CompatWarning[] } | { error: string; status: number };

/** Email channel of an event template. One shared save path so every app sanitizes and revision-checks the same way. */
export async function saveEmailTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- each app's drizzle db, same as CampaignRouteDeps.db
  db: PostgresJsDatabase<any>,
  tables: Pick<NotificationTables, "notificationTemplate">,
  input: SaveEmailTemplateInput,
  known: readonly string[],
): Promise<Result> {
  const t = tables.notificationTemplate;
  const prepared = prepareEmailContent({
    html: input.html,
    preheader: input.preheader,
    subject: input.subject,
    source: input.body,
    known,
  });
  if (prepared.unknownVariables.length) {
    return { error: `Unknown variables: ${prepared.unknownVariables.join(", ")}`, status: 422 };
  }
  const values = { subject: input.subject, body: input.body, html: prepared.html, text: prepared.text, enabled: input.enabled };
  const rows = await db
    .insert(t)
    .values({ event: input.event as never, channel: "email" as never, locale: input.locale as never, ...values, revision: 1 })
    .onConflictDoUpdate({
      target: [t.event, t.channel, t.locale],
      set: { ...values, revision: sql`${t.revision} + 1` },
      setWhere: eq(t.revision, input.revision),
    })
    .returning({ revision: t.revision });
  if (rows.length === 0) return { error: "This template was changed in another tab — reload to continue", status: 409 };
  return { revision: rows[0]!.revision, removed: prepared.removed, lint: prepared.lint };
}
