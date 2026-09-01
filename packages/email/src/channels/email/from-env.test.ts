import { describe, expect, it } from "vitest";
import { createEmailProviderFromEnv, defaultFromAddress, emailTransportKind } from "./from-env";

describe("createEmailProviderFromEnv", () => {
  it("defaults to SES", () => {
    expect(emailTransportKind({})).toBe("ses");
    expect(createEmailProviderFromEnv({}).name).toBe("ses");
  });

  it("selects SMTP when EMAIL_TRANSPORT=smtp", () => {
    const p = createEmailProviderFromEnv({
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "smtp.example.com",
      NOTIFY_FROM_EMAIL: "noreply@example.com",
    });
    expect(p.name).toBe("smtp");
  });

  it("treats EMAIL_PROVIDER=smtp as SMTP and port 465 as implicit TLS", () => {
    expect(emailTransportKind({ EMAIL_PROVIDER: "smtp" })).toBe("smtp");
    const p = createEmailProviderFromEnv({
      EMAIL_TRANSPORT: "smtp",
      SMTP_PORT: "465",
    });
    expect(p.name).toBe("smtp");
  });

  it("reads the From address from env", () => {
    expect(defaultFromAddress({ NOTIFY_FROM_EMAIL: "ops@relay.local", NOTIFY_FROM_NAME: "Ops" })).toEqual({
      email: "ops@relay.local",
      name: "Ops",
    });
  });
});
