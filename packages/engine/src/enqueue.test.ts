import { describe, expect, it } from "vitest";
import { planOutboxRows, type EnqueueInput } from "./enqueue";

const base = { title: "", body: "", kind: "marketing" as const, channels: ["email" as const], campaignId: 7n };

describe("planOutboxRows", () => {
  it("applies prefs, notifyEmail, suppression scope and dedupe per recipient in one batch", () => {
    const inputs: EnqueueInput[] = [
      { ...base, recipientId: 1n, dedupeKey: "cmp:a:1" },
      { ...base, recipientId: 2n, dedupeKey: "cmp:a:2" }, // email pref off
      { ...base, recipientId: 3n, dedupeKey: "cmp:a:3" }, // notifyEmail false
      { ...base, recipientEmail: " Gone@X.com ", dedupeKey: "cmp:a:gone" }, // marketing-suppressed, no account
      { ...base, recipientId: 4n, kind: "transactional", dedupeKey: "tx:4" }, // marketing scope does not block transactional
    ];
    const rows = planOutboxRows(inputs, {
      prefsByUser: new Map([["2", [{ channel: "email", kind: "marketing", enabled: false }]]]),
      userById: new Map([
        ["1", { email: "one@x.com" }],
        ["2", { email: "two@x.com" }],
        ["3", { email: "three@x.com", notifyEmail: false }],
        ["4", { email: "gone@x.com" }],
      ]),
      suppressions: [{ address: "gone@x.com", channel: "email", scope: "marketing" }],
    });

    expect(rows.map((r) => [r.recipientEmail, r.kind, r.dedupeKey])).toEqual([
      ["one@x.com", "marketing", "cmp:a:1:email"],
      ["gone@x.com", "transactional", "tx:4:email"],
    ]);
    expect(rows[0]).toMatchObject({ recipientId: 1n, campaignId: 7n, channel: "email", payload: { vars: {} } });
  });

  it("an all-scope suppression on the phone blocks that recipient's sms", () => {
    const rows = planOutboxRows(
      [{ ...base, kind: "transactional", channels: ["email", "sms"], recipientId: 9n }],
      {
        prefsByUser: new Map(),
        userById: new Map([["9", { email: "n@x.com", phone: "+1 (416) 555-0134" }]]),
        suppressions: [{ address: "+14165550134", channel: "sms", scope: "all" }],
      },
    );
    expect(rows.map((r) => r.channel)).toEqual(["email"]);
  });
});
