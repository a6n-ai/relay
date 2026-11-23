import { securityDb } from "../../db/security/client";
import { securityAudit } from "../../db/security/schema";
import type { Env } from "../../env";

export type AuditEvent = {
  action: string;
  actorUserId?: string | null;
  workspaceId?: string | null;
  target?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown>;
};

// Callers pass only ids, emails and roles. Never an OTP, a token or a key secret.
export async function writeAudit(env: Env, event: AuditEvent): Promise<void> {
  await securityDb(env).insert(securityAudit).values({
    action: event.action,
    actorUserId: event.actorUserId ?? null,
    workspaceId: event.workspaceId ?? null,
    target: event.target ?? null,
    ip: event.ip ?? null,
    userAgent: event.userAgent ?? null,
    data: event.data ? JSON.stringify(event.data) : null,
  });
}
