import { resolveActiveApp } from "@/lib/apps/active-app";
import { operatorDefaultFrom } from "@/lib/email/from-address";
import { emailSendersService } from "@/lib/services/email-senders.service";
import { tenantsService } from "@/lib/services/tenants.service";
import { composeFromOptions, type ComposeFromOption } from "./compose-from";
import { MAILBOX_TENANT_LIMIT, mailboxScope } from "./scope";

export async function loadComposeFroms(): Promise<ComposeFromOption[]> {
  const [scope, operator, tenants, senders, activeApp] = await Promise.all([
    mailboxScope(),
    operatorDefaultFrom(),
    tenantsService.listRecent(undefined, MAILBOX_TENANT_LIMIT),
    emailSendersService.listRecent(),
    resolveActiveApp(),
  ]);
  const tenantById = new Map(tenants.items.map((t) => [t.id.toString(), t]));
  return composeFromOptions({
    operator: scope.includeOperatorMail ? operator : null,
    senders: senders.items.flatMap((s) => {
      if (activeApp && s.tenantId !== activeApp.id) return [];
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
