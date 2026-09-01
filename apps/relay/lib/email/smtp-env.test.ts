import { afterEach, describe, expect, it } from "vitest";
import { applySmtpRowToEnv } from "./smtp-env";

const KEYS = ["EMAIL_TRANSPORT", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"] as const;

describe("applySmtpRowToEnv", () => {
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("switches the process to SMTP and stringifies port/secure", () => {
    applySmtpRowToEnv({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      username: "relay",
      password: "s3cret",
    });
    expect(process.env.EMAIL_TRANSPORT).toBe("smtp");
    expect(process.env.SMTP_HOST).toBe("smtp.example.com");
    expect(process.env.SMTP_PORT).toBe("465");
    expect(process.env.SMTP_SECURE).toBe("true");
    expect(process.env.SMTP_USER).toBe("relay");
    expect(process.env.SMTP_PASS).toBe("s3cret");
  });

  it("omits auth env when username/password are null", () => {
    applySmtpRowToEnv({
      host: "127.0.0.1",
      port: 1025,
      secure: false,
      username: null,
      password: null,
    });
    expect(process.env.SMTP_SECURE).toBe("false");
    expect(process.env.SMTP_USER).toBeUndefined();
    expect(process.env.SMTP_PASS).toBeUndefined();
  });
});
