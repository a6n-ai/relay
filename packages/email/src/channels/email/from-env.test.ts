import { describe, expect, it } from "vitest";
import { createEmailProviderFromEnv, emailTransportKind } from "./from-env";

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
});
