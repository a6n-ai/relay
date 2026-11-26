import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { recordFailure } from "../core/log";

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

export const id = z.string().min(1).max(64);
export const name = z.string().trim().min(1).max(80);
export const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/);
export const appId = z.string().min(1).max(64);
export const displayName = z.string().trim().max(80).optional();
export const replyTo = z.string().trim().toLowerCase().max(254).email().nullable().optional();
export const role = z.enum(["owner", "admin", "member", "billing"]);
export const inviteInput = z.object({ email: z.string().trim().toLowerCase().email(), role });
export const consentSource = z.enum(["purchase", "express_optin", "event_signup", "import_other"]);
export const listInput = z.object({ name, consentSource, consentNote: z.string().trim().max(500).optional() });
export const listPatch = listInput.partial();
export { memberInput } from "../core/member-input";
export const postalAddress = z.string().trim().min(1).max(300);
export const campaignPatch = z.object({
  name: name.optional(),
  fromEmail: z.string().trim().toLowerCase().max(254).email().nullable().optional(),
  subject: z
    .string()
    .max(300)
    .refine((s) => !/[\r\n]/.test(s), "subject must not contain line breaks")
    .optional(),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
  listIds: z.array(id).max(50).optional(),
  audienceKind: z.enum(["lists", "hook"]).optional(),
  audienceQuery: z.string().max(1000).nullable().optional(),
});
export const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  event: z.string().trim().min(1).max(80).nullable().optional(),
  locale: z.string().trim().min(2).max(35).optional(),
  subject: z
    .string()
    .max(300)
    .refine((s) => !/[\r\n]/.test(s), "subject must not contain line breaks")
    .optional(),
  intro: z.string().max(2000).nullable().optional(),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
  enabled: z.boolean().optional(),
});
export const templatePatch = templateInput.partial();
export const automationInput = z.object({
  name,
  listId: id,
  templateId: id,
  fromEmail: z.string().trim().toLowerCase().max(254).email(),
  delayHours: z.number().int().min(0).max(720),
});
export const automationPatch = automationInput.omit({ listId: true }).partial();
