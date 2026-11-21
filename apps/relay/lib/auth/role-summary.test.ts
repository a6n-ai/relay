import { describe, expect, it } from "vitest";
import { roleSummary } from "./role-summary";

describe("roleSummary", () => {
  it("billing allows usage and send history only", () => {
    const billing = roleSummary().find((r) => r.key === "billing");
    expect(billing?.allows.map((a) => a.resource).sort()).toEqual(["log", "tenant", "workspace"]);
  });

  it("lists roles in order with action labels, not raw keys", () => {
    const summary = roleSummary();
    expect(summary.map((r) => r.key)).toEqual(["owner", "admin", "member", "billing"]);
    const member = summary.find((r) => r.key === "member");
    expect(member?.allows.find((a) => a.resource === "mailbox")?.actions).toEqual(["View", "Send mail"]);
  });
});
