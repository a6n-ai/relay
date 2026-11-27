import { describe, expect, it } from "vitest";
import { renderEmailTemplate } from "./email";

describe("render-email", () => {
  it("interpolates + renders markdown to HTML", async () => {
    const out = await renderEmailTemplate({
      subject: "Order {{order.code}}",
      body: "# Hi {{order.customerName}}\n\nYour order **{{order.code}}** is active.",
      vars: { order: { code: "TG-9", customerName: "Sam" } },
      appName: "Tiffin Grab",
    });
    expect(out.subject).toBe("Order TG-9");
    expect(out.html).toContain("TG-9");
    expect(out.html.toLowerCase()).toContain("<html");
    expect(out.text).toContain("TG-9");
  });
});
