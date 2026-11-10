import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let row: Record<string, unknown> | undefined;
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ limit: async () => (row ? [row] : []) }) }) },
}));

const base = { id: 1n, host: "smtp.one.test", port: 587, secure: false, username: null, password: null, fromEmail: "a@one.test", fromName: null };

describe("hydrateSmtpFromDb", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SMTP_HOST;
    delete process.env.NOTIFY_FROM_EMAIL;
  });
  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.EMAIL_TRANSPORT;
    delete process.env.NOTIFY_FROM_EMAIL;
  });

  it("picks up settings another isolate saved, by the row's updated_at", async () => {
    const { hydrateSmtpFromDb } = await import("./provider");
    row = { ...base, updatedAt: 1 };
    await hydrateSmtpFromDb();
    expect(process.env.SMTP_HOST).toBe("smtp.one.test");
    row = { ...base, host: "smtp.two.test", fromEmail: "b@two.test", updatedAt: 2 };
    await hydrateSmtpFromDb();
    expect(process.env.SMTP_HOST).toBe("smtp.two.test");
    expect(process.env.NOTIFY_FROM_EMAIL).toBe("b@two.test");
  });
});
