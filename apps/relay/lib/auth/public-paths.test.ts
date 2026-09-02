import { describe, expect, it } from "vitest";
import { gateRelayPath, isPublicRelayPath } from "./public-paths";

describe("isPublicRelayPath", () => {
  it("allows auth, login, forgot-password, tenant API, and SES webhooks", () => {
    expect(isPublicRelayPath("/")).toBe(true);
    expect(isPublicRelayPath("/login")).toBe(true);
    expect(isPublicRelayPath("/forgot-password")).toBe(true);
    expect(isPublicRelayPath("/api/auth/ok")).toBe(true);
    expect(isPublicRelayPath("/v1/messages")).toBe(true);
    expect(isPublicRelayPath("/api/webhooks/ses")).toBe(true);
    expect(isPublicRelayPath("/api/internal/mailbox/inbound")).toBe(true);
    expect(isPublicRelayPath("/unsubscribe")).toBe(true);
    expect(isPublicRelayPath("/dashboard")).toBe(false);
    expect(isPublicRelayPath("/api/internal")).toBe(false);
  });
});

describe("gateRelayPath", () => {
  it("lets anonymous visitors onto the marketing home", () => {
    expect(gateRelayPath("/", [])).toBe("allow");
  });

  it("sends anonymous dashboard visitors to login", () => {
    expect(gateRelayPath("/dashboard/tenants", [])).toBe("login");
  });

  it("returns 401 JSON for anonymous /api (not auth/webhooks)", () => {
    expect(gateRelayPath("/api/secret", [])).toBe("unauthorized");
  });

  it("lets a session cookie through to the dashboard", () => {
    expect(gateRelayPath("/dashboard", ["better-auth.session_token"])).toBe("allow");
    expect(gateRelayPath("/dashboard", ["__Secure-better-auth.session_token"])).toBe("allow");
  });

  it("does not session-gate inbound mailbox POST", () => {
    expect(gateRelayPath("/api/internal/mailbox/inbound", [])).toBe("allow");
  });

  it("does not session-gate /v1 (tenant API key is checked in the route)", () => {
    expect(gateRelayPath("/v1/messages", [])).toBe("allow");
  });
});
