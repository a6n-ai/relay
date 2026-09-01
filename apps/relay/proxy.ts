import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gateRelayPath } from "@/lib/auth/public-paths";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const decision = gateRelayPath(pathname, request.cookies.getAll().map((c) => c.name));
  if (decision === "allow") return NextResponse.next();
  if (decision === "unauthorized") {
    return new NextResponse(JSON.stringify({ title: "Unauthorized", status: 401 }), {
      status: 401,
      headers: { "content-type": "application/problem+json" },
    });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*", "/v1/:path*", "/login", "/forgot-password"],
};
