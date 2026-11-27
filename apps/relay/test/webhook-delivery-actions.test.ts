import { describe, expect, it } from "vitest";
import { deliveryActions } from "../src/components/webhook-delivery-actions";

const visible = (a: ReturnType<typeof deliveryActions>) => a.filter((x) => !x.hidden).map((x) => x.label);

describe("deliveryActions", () => {
  it("shows Retry for a writer on a failed delivery", () => {
    expect(visible(deliveryActions({ status: "failed", messageId: "m1" }, true))).toContain("Retry");
  });
  it("hides Retry without write access", () => {
    expect(visible(deliveryActions({ status: "failed", messageId: "m1" }, false))).not.toContain("Retry");
  });
  it("hides Retry on a delivered row", () => {
    expect(visible(deliveryActions({ status: "delivered", messageId: "m1" }, true))).not.toContain("Retry");
  });
  it("offers Open message only when a message exists", () => {
    expect(visible(deliveryActions({ status: "failed", messageId: "m1" }, true))).toContain("Open message");
    expect(visible(deliveryActions({ status: "failed", messageId: null }, true))).not.toContain("Open message");
  });
});
