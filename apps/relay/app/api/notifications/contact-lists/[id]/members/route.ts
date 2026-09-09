import { z } from "zod";
import { createValidatedIdRoute } from "@foundry/routes";
import { addContactListMembers, manualContactSchema } from "@relay/engine";
import { operatorCampaignDeps } from "@/lib/campaigns/deps";
import { operatorGuard } from "@/lib/campaigns/http";

const bodySchema = z.object({ contacts: z.array(manualContactSchema).min(1) });

export const POST = createValidatedIdRoute(
  bodySchema,
  (id, body) => addContactListMembers(operatorCampaignDeps(), id, body.contacts),
  { guard: operatorGuard },
);
