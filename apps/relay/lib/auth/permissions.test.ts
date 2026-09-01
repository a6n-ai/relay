import { describe, expect, it } from "vitest";
import { createPermissionGuards } from "@foundry/auth";
import { roles, statement } from "./permissions";

const { roleCan } = createPermissionGuards(async () => ({ user: { role: "admin" } }), roles);

describe("Relay access control", () => {
  it("adds tenant, message, and sending verbs on top of the Foundry base statement", () => {
    expect(statement.tenant).toEqual(["read", "write"]);
    expect(statement.message).toEqual(["read", "write"]);
    expect(statement.sending).toEqual(["read", "write"]);
  });

  it("lets the operator admin read/write tenants, sending, and messages", () => {
    expect(roleCan("admin", { tenant: ["read", "write"] })).toBe(true);
    expect(roleCan("admin", { sending: ["read", "write"] })).toBe(true);
    expect(roleCan("admin", { message: ["read", "write"] })).toBe(true);
  });
});
