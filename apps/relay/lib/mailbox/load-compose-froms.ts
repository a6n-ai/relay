import { operatorDefaultFrom } from "@/lib/email/from-address";
import { emailSendersService } from "@/lib/services/email-senders.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { composeFromOptions, type ComposeFromOption } from "./compose-from";

export async function loadComposeFroms(): Promise<ComposeFromOption[]> {
  const [operator, tenants, senders] = await Promise.all([
    operatorDefaultFrom(),
    tenantsService.listRecent(),
    emailSendersService.listRecent(),
  ]);
  const tenantById = new Map(tenants.items.map((t) => [t.id.toString(), t]));
  return composeFromOptions({
    operator,
    senders: senders.items.flatMap((s) => {
      const tenant = tenantById.get(s.tenantId.toString());
      if (!tenant) return [];
      return [
        {
          publicId: s.publicId,
          email: s.email,
          displayName: s.displayName,
          verifiedAt: s.verifiedAt,
          tenantPublicId: tenant.publicId,
          tenantName: tenant.name,
        },
      ];
    }),
  });
}
