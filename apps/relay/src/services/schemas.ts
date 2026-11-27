import { z } from "zod";
import { AUDIENCE_QUERY_MAX, BODY_MAX, CONSENT_NOTE_MAX, NAME_MAX, TEMPLATE_NAME_MAX } from "../shared/limits";
import { emailSchema, idSchema } from "../shared/schemas";

// The public API and the RPC share these with the console, so they live below both.
export const id = idSchema;
export const name = z.string().trim().min(1).max(NAME_MAX);
export const consentSource = z.enum(["purchase", "express_optin", "event_signup", "import_other"]);
export const listInput = z.object({ name, consentSource, consentNote: z.string().trim().max(CONSENT_NOTE_MAX).optional() });
export const listPatch = listInput.partial();
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
