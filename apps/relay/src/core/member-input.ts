import { z } from "zod";

// Lives in core, not console/schemas.ts: that module imports the TanStack server helpers, which the API layer must not load.
export const memberInput = z.object({
  email: z.string().trim().toLowerCase().max(254).email(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  consentAt: z.number().int().positive().refine((at) => at <= Date.now(), "consentAt is in the future").optional(),
});
