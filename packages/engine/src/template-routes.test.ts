import { describe, expect, it, vi } from "vitest";
import { saveEmailTemplate } from "./template-routes";

function fakeDb(returned: { revision: number }[]) {
  const chain = { values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(returned) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { insert: vi.fn().mockReturnValue(chain) } as any, chain };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tables = { notificationTemplate: { event: {}, channel: {}, locale: {}, revision: {} } } as any;
const input = { event: "order_activated", locale: "en", subject: "Order {{order.code}}", body: "<p>x</p>", html: "<p>x</p>", preheader: "", enabled: true, revision: 2 };

describe("saveEmailTemplate", () => {
  it("saves and returns the next revision", async () => {
    const { db, chain } = fakeDb([{ revision: 3 }]);
    expect(await saveEmailTemplate(db, tables, input, ["order.code"])).toEqual({ revision: 3, removed: [], lint: [] });
    expect(chain.values.mock.calls[0][0]).toMatchObject({ channel: "email", html: "<p>x</p>", text: "x" });
  });
  it("409s on a stale revision", async () => {
    const { db } = fakeDb([]);
    expect(await saveEmailTemplate(db, tables, input, ["order.code"])).toMatchObject({ status: 409 });
  });
  it("422s on unknown variables", async () => {
    const { db } = fakeDb([{ revision: 3 }]);
    expect(await saveEmailTemplate(db, tables, input, [])).toEqual({ error: "Unknown variables: order.code", status: 422 });
  });
});
