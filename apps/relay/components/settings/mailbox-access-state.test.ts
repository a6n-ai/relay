import { describe, expect, it } from "vitest";
import { applyServerGrants, beginToggle, grantKey, isLocked, settleToggle, type AccessState } from "./mailbox-access-state";

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
    expect(isLocked(begun, key)).toBe(true);
    expect(beginToggle(begun, key, false)).toBeNull();
  });

  it("successful tick stays ticked and clears pending", () => {
    const settled = settleToggle(beginToggle(idle, key, true)!, key, undefined, true);
    expect(isLocked(settled, key)).toBe(true); // still "" until the refreshed grid arrives
    expect(settled.pending).toEqual([]);
    expect(settled.grants[key]).toBe("");
  });

  it("untick is blocked while the tick has no grant id yet", () => {
    const ticked = settleToggle(beginToggle(idle, key, true)!, key, undefined, true);
    expect(beginToggle(ticked, key, false)).toBeNull();
  });

  it("refresh keeps an in-flight tick instead of dropping it", () => {
    const other = grantKey("tmb_2", { teamId: "tem_1" });
    const pending = beginToggle(idle, key, true)!;
    const merged = applyServerGrants(pending, { [other]: "mgr_9" });
    expect(merged.grants[key]).toBe("");
    expect(merged.grants[other]).toBe("mgr_9");
    expect(merged.pending).toEqual([key]);
  });

  it("refresh drops an in-flight untick that the server already removed", () => {
    const unticked: AccessState = { grants: {}, pending: [key] };
    const merged = applyServerGrants(unticked, { [key]: "mgr_1" });
    expect(merged.grants[key]).toBeUndefined();
  });

  it("refresh takes server grants for settled cells", () => {
    const merged = applyServerGrants(idle, { [key]: "mgr_1" });
    expect(merged).toEqual({ grants: { [key]: "mgr_1" }, pending: [] });
  });

  it("grant keys are per mailbox and per target", () => {
    expect(grantKey("tmb_1", { memberPublicId: "mbr_1" })).toBe("tmb_1|member:mbr_1");
    expect(grantKey("tmb_2", { teamId: "tem_1" })).not.toBe(key);
  });
});
