import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { id, name } from "../services/schemas";
import { recordFailure } from "../core/log";
import { AUTOMATION_DELAY_MAX, NAME_MAX } from "../shared/limits";
import { emailSchema, idSchema, slugSchema } from "../shared/schemas";
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

export { id, name };
export const slug = slugSchema;
export const appId = idSchema;
export const displayName = z.string().trim().max(NAME_MAX).optional();
export const replyTo = emailSchema.nullable().optional();
export const role = z.enum(ORG_ROLES);
export const inviteInput = z.object({ email: emailSchema, role });
export { memberInput } from "../core/member-input";
export const postalAddress = z.string().trim().min(1).max(300);
export const automationInput = z.object({
  name,
  listId: id,
  templateId: id,
  fromEmail: emailSchema,
  delayHours: z.number().int().min(0).max(AUTOMATION_DELAY_MAX),
});
export const automationPatch = automationInput.omit({ listId: true }).partial();
