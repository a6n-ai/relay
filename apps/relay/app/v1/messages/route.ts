import { enqueueTenant } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { authenticateTenant } from "@/lib/tenants/auth";
import { parseMessageJson } from "@/lib/v1/message-body";

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
    channels: input.channels ?? ["email"],
    kind: input.kind ?? "transactional",
    dedupeKey: input.idempotencyKey,
  });
  return Response.json({ accepted: true }, { status: 202 });
}
