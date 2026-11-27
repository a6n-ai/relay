import { and, eq, gt } from "drizzle-orm";
import { coreDb } from "../db/core/client";
import { address } from "../db/core/schema";
import { securityDb } from "../db/security/client";
import { account, invitation, member, user } from "../db/security/schema";
import type { Env } from "../env";

export function mailboxCandidates(name: string, domain: string): string[] {
  const words = name
    .normalize("NFKD")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
  const first = words[0] ?? "user";
  const out = [`${first}@${domain}`];
  if (words.length > 1) out.push(`${first}.${words[words.length - 1]}@${domain}`);
  for (let n = 2; n <= 9; n++) out.push(`${first}${n}@${domain}`);
  return out;
}

export async function mailboxFree(env: Env, email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const [taken] = await coreDb(env).select({ id: address.id }).from(address).where(eq(address.email, e)).limit(1);
  if (taken) return false;
  const db = securityDb(env);
  const [invited] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(and(eq(invitation.email, e), eq(invitation.status, "pending"), gt(invitation.expiresAt, new Date())))
    .limit(1);
  if (invited) return false;
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, e));
  if (!u) return true;
  const [m] = await db.select({ id: member.id }).from(member).where(eq(member.userId, u.id)).limit(1);
  if (m) return false;
  const [c] = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.userId, u.id))
    .limit(1);
  return !c;
}

export async function suggestMailbox(env: Env, name: string, domain: string): Promise<string | null> {
  for (const candidate of mailboxCandidates(name, domain)) if (await mailboxFree(env, candidate)) return candidate;
  return null;
}
