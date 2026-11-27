// Returns the response to send when the request must not reach an internal route, or null to continue.
// Constant-time compare: workers-types does not type crypto.subtle.timingSafeEqual.
export function guardInternal(request: Request, secret: string | undefined): Response | null {
  if (!secret) return new Response(null, { status: 404 });
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  const given = new TextEncoder().encode(request.headers.get("authorization") ?? "");
  let diff = expected.length ^ given.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (given[i % given.length] ?? 0);
  return diff === 0 ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
