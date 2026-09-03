import { describe, expect, it } from "vitest";
import { composeFromOptions } from "./compose-from";

describe("composeFromOptions", () => {
  it("lists operator From then each verified app sender", () => {
    expect(
      composeFromOptions({
        operator: { email: "ops@relay.local", name: "Relay" },
        senders: [
          {
            publicId: "tes_1",
            email: "receipts@shop.test",
            displayName: "Receipts",
            verifiedAt: 1,
            tenantPublicId: "ctn_1",
            tenantName: "Shop",
          },
          {
            publicId: "tes_2",
            email: "draft@shop.test",
            displayName: null,
            verifiedAt: null,
            tenantPublicId: "ctn_1",
            tenantName: "Shop",
          },
        ],
      }).map((o) => o.id),
    ).toEqual(["operator", "tes_1"]);
  });
});
