import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { recordFailure } from "../core/log";
import { AUDIENCE_QUERY_MAX, AUTOMATION_DELAY_MAX, BODY_MAX, CONSENT_NOTE_MAX, NAME_MAX, TEMPLATE_NAME_MAX } from "../shared/limits";
import { emailSchema, idSchema, slugSchema, subjectSchema } from "../shared/schemas";
import { ORG_ROLES } from "../shared/roles";

// Only .validator() calls use these. Top-level zod consts in .fns.ts survive the client compile and pull zod into the entry chunk.
// A failed parse is a 400 with a fixed message; the issue JSON would otherwise reach the form as a raw 500.
export const validate =
  <T extends z.ZodType>(schema: T) =>
  (raw: unknown): z.output<T> => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      setResponseStatus(400);
      // Field paths and issue codes only: the submitted values stay out of the log.
      const where = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}:${i.code}`).join(", ");
      throw recordFailure(new Error("invalid input"), 400, new Error(`invalid input at ${where}`));
    }
    return parsed.data;
  };

export const id = idSchema;
export const name = z.string().trim().min(1).max(NAME_MAX);
export const slug = slugSchema;
export const appId = idSchema;
export const displayName = z.string().trim().max(NAME_MAX).optional();
export const replyTo = emailSchema.nullable().optional();
export const role = z.enum(ORG_ROLES);
export const inviteInput = z.object({ email: emailSchema, role });
export const consentSource = z.enum(["purchase", "express_optin", "event_signup", "import_other"]);
export const listInput = z.object({ name, consentSource, consentNote: z.string().trim().max(CONSENT_NOTE_MAX).optional() });
export const listPatch = listInput.partial();
export { memberInput } from "../core/member-input";
export const postalAddress = z.string().trim().min(1).max(300);
export const campaignPatch = z.object({
  name: name.optional(),
  fromEmail: emailSchema.nullable().optional(),
  subject: z
    .string()
    .max(300)
    .refine((s) => !/[\r\n]/.test(s), "subject must not contain line breaks")
    .optional(),
  html: z.string().max(BODY_MAX).optional(),
  text: z.string().max(BODY_MAX).optional(),
  listIds: z.array(id).max(50).optional(),
  audienceKind: z.enum(["lists", "hook"]).optional(),
  audienceQuery: z.string().max(AUDIENCE_QUERY_MAX).nullable().optional(),
});
export const templateInput = z.object({
  name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX),
  event: z.string().trim().min(1).max(NAME_MAX).nullable().optional(),
  locale: z.string().trim().min(2).max(35).optional(),
  subject: z
    .string()
    .max(300)
    .refine((s) => !/[\r\n]/.test(s), "subject must not contain line breaks")
    .optional(),
  intro: z.string().max(2000).nullable().optional(),
  html: z.string().max(BODY_MAX).optional(),
  text: z.string().max(BODY_MAX).optional(),
  enabled: z.boolean().optional(),
});
export const templatePatch = templateInput.partial();
export const automationInput = z.object({
  name,
  listId: id,
  templateId: id,
  fromEmail: emailSchema,
  delayHours: z.number().int().min(0).max(AUTOMATION_DELAY_MAX),
});
export const automationPatch = automationInput.omit({ listId: true }).partial();
