import { z } from "zod";
import { emailSchema } from "../shared/schemas";
import { NAME_MAX } from "../shared/limits";

// Lives in core, not console/schemas.ts: that module imports the TanStack server helpers, which the API layer must not load.
export const memberInput = z.object({
  email: emailSchema,
  firstName: z.string().trim().max(NAME_MAX).optional(),
  lastName: z.string().trim().max(NAME_MAX).optional(),
  consentAt: z.number().int().positive().refine((at) => at <= Date.now(), "consentAt is in the future").optional(),
});
