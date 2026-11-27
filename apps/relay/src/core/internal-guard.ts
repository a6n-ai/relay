import { constantTimeEqual } from "./crypto";

export function guardInternal(request: Request, secret: string | undefined): Response | null {
  if (!secret) return new Response(null, { status: 404 });
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  const given = new TextEncoder().encode(request.headers.get("authorization") ?? "");
  return constantTimeEqual(expected, given) ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
