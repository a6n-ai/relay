import { describe, expect, it } from "vitest";
import { absoluteUrl } from "./upload-email-image";

describe("absoluteUrl", () => {
  it("keeps an absolute CDN url", () =>
    expect(absoluteUrl("https://cdn.tiffingrab.ca/public/a.png", "https://app.tiffingrab.ca")).toBe(
      "https://cdn.tiffingrab.ca/public/a.png",
    ));
  it("makes a root-relative url absolute", () =>
    expect(absoluteUrl("/api/files/public/a.png", "https://app.tiffingrab.ca")).toBe(
      "https://app.tiffingrab.ca/api/files/public/a.png",
    ));
  it("upgrades a protocol-relative url to https", () =>
    expect(absoluteUrl("//cdn.x/a.png", "https://app.x")).toBe("https://cdn.x/a.png"));
});
