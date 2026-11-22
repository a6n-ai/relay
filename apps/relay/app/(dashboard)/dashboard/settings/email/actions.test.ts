import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  setRouting: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/org-scope", () => ({ requirePlatformAdmin: h.requirePlatformAdmin }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn() }));
vi.mock("@relay/email", () => ({ sesEventSettings: () => ({ setRouting: h.setRouting }) }));
vi.mock("@/lib/email/streams", () => ({
  parseRoutingInput: (r: unknown) => r,
  parseEmailStreams: () => [{ id: "transactional" }],
}));

const { saveStreamRouting } = await import("./actions");

describe("saveStreamRouting", () => {
  beforeEach(() => {
    h.setRouting.mockReset();
    h.requirePlatformAdmin.mockReset().mockResolvedValue(undefined);
  });

  it("saveStreamRouting refuses a non-platform admin", async () => {
    h.requirePlatformAdmin.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    const result = await saveStreamRouting("transactional", { webhook: ["delivery"] });

    expect(result.error).toBeTruthy();
    expect(h.setRouting).not.toHaveBeenCalled();
  });
});
