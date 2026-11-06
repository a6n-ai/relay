import { describe, expect, it } from "vitest";
import { createEmailProviderFromEnv, defaultFromAddress, emailTransportKind } from "./from-env";
import { createSmtpProviderFromEnv } from "../../smtp";

describe("createEmailProviderFromEnv", () => {
  it("defaults to SES and wires the configuration set", () => {
    expect(emailTransportKind({})).toBe("ses");
    const p = createEmailProviderFromEnv({ SES_CONFIGURATION_SET: "tg-events" });
    expect(p.name).toBe("ses");
    expect(p).toMatchObject({ configurationSetName: "tg-events" });
  });

  it("throws pointing at @relay/email/smtp when EMAIL_TRANSPORT=smtp", () => {
    expect(() => createEmailProviderFromEnv({ EMAIL_TRANSPORT: "smtp" })).toThrow(/@relay\/email\/smtp/);
  });

  it("createSmtpProviderFromEnv builds the SMTP provider", () => {
    const p = createSmtpProviderFromEnv({
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "smtp.example.com",
      NOTIFY_FROM_EMAIL: "noreply@example.com",
    });
    expect(p.name).toBe("smtp");
  });

  it("treats EMAIL_PROVIDER=smtp as SMTP and port 465 as implicit TLS", () => {
    expect(emailTransportKind({ EMAIL_PROVIDER: "smtp" })).toBe("smtp");
    const p = createSmtpProviderFromEnv({
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
