import { AuthError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getFreshSession } from "@/lib/auth/session";

export async function operatorGuard(perms: Record<string, string[]>): Promise<void> {
  const session = await getFreshSession();
  if (!session?.user) throw new AuthError();
  await requirePermission(perms);
}

export function problem(status: number, title: string, detail?: string) {
  return Response.json({ title, status, detail }, { status });
}
