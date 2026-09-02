import { enqueueTenant } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { applyListAutomations } from "@/lib/automations/apply-list";
import { authenticateTenant, requestedChannels } from "@/lib/tenants/auth";
import { deniedChannels } from "@/lib/tenants/channels";
import { quotaExceeded } from "@/lib/tenants/quota";
import { countTenantSendsThisMonth } from "@/lib/tenants/usage";
import { parseMessageJson } from "@/lib/v1/message-body";
import { enqueueTenantWebhooks } from "@/lib/webhooks/enqueue";

export async function POST(req: Request) {
  const tenant = await authenticateTenant(req);
  if (!tenant) {
    return Response.json({ title: "Unauthorized", status: 401 }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ title: "Invalid JSON", status: 400 }, { status: 400 });
  }
  const parsed = parseMessageJson(json);
  if (!parsed.ok) {
    return Response.json(
      { title: parsed.title, status: parsed.status, issues: parsed.issues },
      { status: parsed.status },
    );
  }
  const input = parsed.data;
  const channels = requestedChannels(input);
  const denied = deniedChannels(tenant.channels, channels);
  if (denied.length > 0) {
    return Response.json(
      { title: "Channel not granted on this key", status: 403, channels: denied },
      { status: 403 },
    );
  }
  const used = await countTenantSendsThisMonth(tenant.tenantId);
  if (quotaExceeded(used, tenant.monthlyMessageQuota)) {
    return Response.json(
      { title: "Monthly message quota exceeded", status: 429, used, quota: tenant.monthlyMessageQuota },
      { status: 429 },
    );
  }
  await enqueueTenant(db, notificationTables, {
    tenantId: tenant.tenantId,
    event: input.event,
    recipientExternalId: input.to.userId,
    recipientEmail: input.to.email,
    recipientPhone: input.to.phone,
    title: input.title,
    body: input.body,
    href: input.href,
    data: input.vars,
    channels,
    kind: input.kind ?? "transactional",
    dedupeKey: input.idempotencyKey,
    nextAttemptAt: input.sendAt,
  });
  await applyListAutomations({
    tenantId: tenant.tenantId,
    event: input.event,
    email: input.to.email,
    phone: input.to.phone,
  });
  await enqueueTenantWebhooks(tenant.tenantId, "message.queued", {
    event: input.event ?? null,
    channels,
    kind: input.kind ?? "transactional",
    recipientEmail: input.to.email ?? null,
    recipientPhone: input.to.phone ?? null,
    sendAt: input.sendAt ?? null,
  });
  return Response.json({ accepted: true }, { status: 202 });
}
