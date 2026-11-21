import { describe, expect, it } from "vitest";
import { checkRoleChange, checkSuspendOrRemove, parseRoles } from "./member-rules";

const owner = { memberId: "mbr_owner", roles: ["owner"] };
const admin = { memberId: "mbr_admin", roles: ["admin"] };
const target = { memberId: "mbr_target", roles: ["member"], status: "active" };

describe("parseRoles", () => {
  it("splits, trims, drops empty and dedupes", () => {
    expect(parseRoles(" owner, admin ,,owner ")).toEqual(["owner", "admin"]);
    expect(parseRoles("")).toEqual([]);
  });
});

describe("checkRoleChange", () => {
  const base = { actor: owner, target, next: ["member"], activeOwnerCount: 1 };

  it("refuses changing your own roles", () => {
    expect(checkRoleChange({ ...base, target: { ...target, memberId: owner.memberId, roles: ["owner"] }, next: ["owner", "member"] })).toBe(
      "You can’t change your own roles",
    );
  });

  it("refuses an empty role list", () => {
    expect(checkRoleChange({ ...base, next: [] })).toBe("Pick at least one role");
  });

  it("refuses a role that is not in orgRoles", () => {
    expect(checkRoleChange({ ...base, next: ["wizard"] })).toBe("Unknown role");
  });

  it("refuses an admin adding the owner role", () => {
    expect(checkRoleChange({ ...base, actor: admin, next: ["owner"] })).toBe("Only an owner can add or remove the owner role");
  });

  it("refuses removing the last active owner", () => {
    const lastOwner = { ...target, roles: ["owner"] };
    expect(checkRoleChange({ ...base, target: lastOwner, next: ["member"], activeOwnerCount: 1 })).toBe(
      "A workspace needs at least one owner",
    );
  });

  it("admin may add billing to a member", () => {
    expect(checkRoleChange({ ...base, actor: admin, next: ["member", "billing"] })).toBeNull();
  });

  it("owner may demote another owner when two active owners remain", () => {
    const otherOwner = { ...target, roles: ["owner"] };
    expect(checkRoleChange({ ...base, target: otherOwner, next: ["admin"], activeOwnerCount: 2 })).toBeNull();
  });
});

describe("checkSuspendOrRemove", () => {
  const base = { actor: owner, target, activeOwnerCount: 1 };

  it("refuses suspending yourself", () => {
    expect(
      checkSuspendOrRemove({ ...base, target: { ...target, memberId: owner.memberId, roles: ["owner"] }, action: "suspend", activeOwnerCount: 2 }),
    ).toBe("You can’t suspend yourself");
  });

  it("refuses removing yourself", () => {
    expect(
      checkSuspendOrRemove({ ...base, target: { ...target, memberId: owner.memberId, roles: ["owner"] }, action: "remove", activeOwnerCount: 2 }),
    ).toBe("You can’t remove yourself");
  });

  it("refuses an admin suspending an owner", () => {
    expect(checkSuspendOrRemove({ ...base, actor: admin, target: { ...target, roles: ["owner"] }, action: "suspend", activeOwnerCount: 2 })).toBe(
      "Only an owner can suspend or remove an owner",
    );
  });

  it("refuses removing the last active owner", () => {
    expect(checkSuspendOrRemove({ ...base, target: { ...target, roles: ["owner"] }, action: "remove", activeOwnerCount: 1 })).toBe(
      "A workspace needs at least one owner",
    );
  });

  it("allows removing a plain member", () => {
    expect(checkSuspendOrRemove({ ...base, action: "remove" })).toBeNull();
  });

  it("admin cannot reactivate an owner", () => {
    const suspendedOwner = { ...target, roles: ["owner"], status: "suspended" };
    expect(checkSuspendOrRemove({ ...base, actor: admin, target: suspendedOwner, action: "reactivate" })).toBe(
      "Only an owner can suspend or remove an owner",
    );
  });

  it("owner can reactivate an owner", () => {
    const suspendedOwner = { ...target, roles: ["owner"], status: "suspended" };
    expect(checkSuspendOrRemove({ ...base, target: suspendedOwner, action: "reactivate" })).toBeNull();
  });

  it("refuses reactivating yourself", () => {
    expect(
      checkSuspendOrRemove({ ...base, target: { ...target, memberId: owner.memberId, status: "suspended" }, action: "reactivate" }),
    ).toBe("You can’t reactivate yourself");
  });
});
