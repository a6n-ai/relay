import { AuthError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";

export async function operatorGuard(): Promise<void> {
  const session = await getSession();
  if (!session?.user) throw new AuthError();
}

/** @deprecated prefer operatorGuard + @foundry/routes handler */
export async function requireOperatorSession(): Promise<Response | null> {
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ title: "Unauthorized", status: 401 }, { status: 401 });
  }
  return null;
}

export function problem(status: number, title: string, detail?: string) {
  return Response.json({ title, status, detail }, { status });
}
