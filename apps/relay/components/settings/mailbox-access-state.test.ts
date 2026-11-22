import { describe, expect, it } from "vitest";
import { beginToggle, grantKey, isPending, settleToggle, type AccessState } from "./mailbox-access-state";

const key = grantKey("tmb_1", { teamId: "tem_1" });
const idle: AccessState = { grants: {}, pending: [] };

describe("mailbox access toggle", () => {
  it("failed tick reverts", () => {
    const begun = beginToggle(idle, key, true);
    expect(begun?.grants[key]).toBeDefined();

    const settled = settleToggle(begun!, key, undefined, false);
    expect(settled).toEqual({ grants: {}, pending: [] });
  });

  it("failed untick puts the grant back", () => {
    const granted: AccessState = { grants: { [key]: "mgr_1" }, pending: [] };
    const begun = beginToggle(granted, key, false);
    expect(begun?.grants[key]).toBeUndefined();

    const settled = settleToggle(begun!, key, "mgr_1", false);
    expect(settled.grants[key]).toBe("mgr_1");
  });

  it("cell is disabled while pending", () => {
    const begun = beginToggle(idle, key, true)!;
    expect(isPending(begun, key)).toBe(true);
    expect(beginToggle(begun, key, false)).toBeNull();
  });

  it("successful tick stays ticked and clears pending", () => {
    const settled = settleToggle(beginToggle(idle, key, true)!, key, undefined, true);
    expect(isPending(settled, key)).toBe(false);
    expect(settled.grants[key]).toBeDefined();
  });

  it("grant keys are per mailbox and per target", () => {
    expect(grantKey("tmb_1", { memberPublicId: "mbr_1" })).toBe("tmb_1|member:mbr_1");
    expect(grantKey("tmb_2", { teamId: "tem_1" })).not.toBe(key);
  });
});
