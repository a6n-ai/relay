import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  dbSelect: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/org-scope", () => ({ requirePlatformAdmin: h.requirePlatformAdmin }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@/db/client", () => ({
  db: { select: (...args: unknown[]) => h.dbSelect(...args) },
}));
vi.mock("@/lib/email/provider", () => ({ resetEmailProvider: vi.fn() }));
vi.mock("@/lib/email/smtp-env", () => ({ applySmtpRowToEnv: vi.fn() }));
vi.mock("@/lib/email/smtp-form", () => ({
  parseSmtpSettingsForm: () => ({ value: { host: "smtp.example.com" } }),
}));
vi.mock("@/lib/services/sending.service", () => ({
  smtpSettingsService: { update: h.update, create: h.create },
}));

const { saveSmtpSettingsAction } = await import("./actions");

describe("saveSmtpSettingsAction", () => {
  beforeEach(() => {
    h.dbSelect.mockReset().mockReturnValue({ from: () => ({ limit: async () => [] }) });
    h.update.mockReset();
    h.create.mockReset();
    h.requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  });

  it("saveSmtpSettingsAction refuses a non-platform admin", async () => {
    h.requirePlatformAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const result = await saveSmtpSettingsAction(new FormData());

    expect(result.error).toBeTruthy();
    expect(h.dbSelect).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
