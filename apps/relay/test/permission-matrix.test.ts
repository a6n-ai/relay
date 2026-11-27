import { ownerAc, adminAc, memberAc } from "better-auth/plugins/organization/access";
import { describe, expect, it } from "vitest";
import { orgRoles } from "../src/auth/permissions";
import { ORG_PERMISSIONS, allows, type Permission } from "../src/shared/permissions";
import { ORG_ROLES } from "../src/shared/roles";

describe("permission table", () => {
  it("answers like the better-auth role for every role, resource and action", () => {
    for (const role of ORG_ROLES) {
      for (const [resource, actions] of Object.entries(ORG_PERMISSIONS)) {
        for (const action of Object.keys(actions)) {
          const need = { [resource]: [action] };
          expect(allows([role], need as Permission), `${role} ${resource}:${action}`).toBe(
            orgRoles[role].authorize(need).success,
          );
        }
      }
    }
  });

  it("keeps better-auth's own owner, admin and member defaults for its built-in resources", () => {
    const builtin = { owner: ownerAc, admin: adminAc, member: memberAc } as const;
    for (const [role, ac] of Object.entries(builtin)) {
      for (const [resource, actions] of Object.entries(ac.statements)) {
        for (const action of actions as string[]) {
          expect(allows([role as "owner"], { [resource]: [action] } as Permission), `${role} ${resource}:${action}`).toBe(true);
        }
      }
    }
    for (const resource of ["organization", "member", "invitation", "team", "ac"] as const) {
      for (const action of Object.keys(ORG_PERMISSIONS[resource])) {
        const held = ORG_ROLES.filter((r) => allows([r], { [resource]: [action] } as Permission));
        const expected = Object.entries(builtin)
          .filter(([, ac]) => (ac.statements as Record<string, readonly string[]>)[resource]?.includes(action))
          .map(([r]) => r);
        expect(held, `${resource}:${action}`).toEqual(expected);
      }
    }
  });

  it("needs every listed action and a resource that exists", () => {
    expect(allows(["member"], { campaign: ["read", "write"] })).toBe(false);
    expect(allows(["member", "admin"], { campaign: ["read", "write"] })).toBe(true);
    expect(allows(["owner"], { nope: ["read"] } as never)).toBe(false);
  });
});

// Before a workspace exists there is no actor, so these two check the origin inside their service; the preview only reads (POST carries the id).
const EXEMPT: Record<string, string> = {
  createWorkspaceFn: "../src/services/workspaces.ts",
  acceptInviteFn: "../src/services/members.ts",
  domainDeletePreview: "",
};
const services = import.meta.glob("../src/services/{workspaces,members}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const fnsFiles = import.meta.glob("../src/console/*.fns.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("every POST server function is a write", () => {
  const cases = Object.entries(fnsFiles).flatMap(([path, src]) => {
    const writeNames = [...src.matchAll(/const (\w+) = WRITE\(/g)].map((m) => m[1]);
    const parts = src.split(/(?=createServerFn\()/).slice(1);
    return parts
      .filter((p) => /createServerFn\(\{ method: "POST" \}\)/.test(p))
      .map((p) => {
        const name = /export const (\w+)/.exec(src.slice(Math.max(0, src.indexOf(p) - 80), src.indexOf(p)))?.[1] ?? p.slice(0, 40);
        const guarded =
          /\bWRITE\(/.test(p) ||
          writeNames.some((n) => new RegExp(`\\b${n}\\b`).test(p)) ||
          /\brunAdmin\((?![^;]*,\s*false\))/.test(p) ||
          /\bassertSameOrigin\(/.test(p) ||
          (name in EXEMPT && (!EXEMPT[name] || /\bassertSameOrigin\(/.test(services[EXEMPT[name]] ?? "")));
        return [`${path.split("/").pop()} ${name}`, guarded] as const;
      });
  });

  it("finds the POST handlers", () => {
    expect(cases.length).toBeGreaterThan(40);
  });

  it.each(cases)("%s", (_name, guarded) => {
    expect(guarded).toBe(true);
  });
});
