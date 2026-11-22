import { describe, expect, it } from "vitest";
import { createPermissionGuards } from "@foundry/auth";
import { appStatement, orgRoles, PERMISSION_LABELS, ROLE_LABELS, roles, statement } from "./permissions";

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

describe("workspace roles", () => {
  it("billing reads usage but cannot send mail", () => {
    expect(orgRoles.billing.authorize({ workspace: ["usage"] }).success).toBe(true);
    expect(orgRoles.billing.authorize({ mailbox: ["send"] }).success).toBe(false);
  });

  it("member cannot write tenants and admin can invite", () => {
    expect(orgRoles.member.authorize({ tenant: ["write"] }).success).toBe(false);
    expect(orgRoles.admin.authorize({ invitation: ["create"] }).success).toBe(true);
  });

  it("labels workspace limits as view-only, since only the platform changes them", () => {
    const workspace = PERMISSION_LABELS.find((p) => p.resource === "workspace");
    expect(workspace?.actions.find((a) => a.action === "limits")?.label).toBe("See limits");
  });

  it("gives every role a label and every app resource a label", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(Object.keys(orgRoles).sort());
    const resources = PERMISSION_LABELS.map((p) => p.resource);
    for (const r of Object.keys(appStatement)) expect(resources).toContain(r);
  });
});
