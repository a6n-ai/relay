import { AuthError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getFreshSession } from "@/lib/auth/session";

export async function operatorGuard(perms: Record<string, string[]>): Promise<void> {
  const session = await getFreshSession();
  if (!session?.user) throw new AuthError();
  await requirePermission(perms);
}

/** @deprecated prefer operatorGuard + @foundry/routes handler */
export async function requireOperatorSession(): Promise<Response | null> {
  const session = await getFreshSession();
  if (!session?.user) {
    return Response.json({ title: "Unauthorized", status: 401 }, { status: 401 });
  }
  return null;
}

export function problem(status: number, title: string, detail?: string) {
  return Response.json({ title, status, detail }, { status });
}
