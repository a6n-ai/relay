import { securityDb } from "../../db/security/client";
import { securityAudit } from "../../db/security/schema";
import type { Env } from "../../env";

type AuditEvent = {
  action: string;
  actorUserId?: string | null;
  workspaceId?: string | null;
  target?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown>;
};

// Callers pass only ids, emails and roles. Never an OTP, a token or a key secret.
// Best effort: the action has already committed, so a failed audit row must not fail the caller.
export async function writeAudit(env: Env, event: AuditEvent): Promise<void> {
  try {
    await securityDb(env).insert(securityAudit).values({
      action: event.action,
      actorUserId: event.actorUserId ?? null,
      workspaceId: event.workspaceId ?? null,
      target: event.target?.slice(0, 320) ?? null,
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      data: event.data ? JSON.stringify(event.data) : null,
    });
  } catch (error) {
    // Action and message only: data and target can hold emails or ids.
    console.error(`audit write failed: ${event.action}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
