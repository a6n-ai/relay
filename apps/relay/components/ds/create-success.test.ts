import { describe, expect, it } from "vitest";
import { createSuccessToast, isCreateSuccess } from "./create-success";

describe("isCreateSuccess", () => {
  it("is true when there is no error", () => {
    expect(isCreateSuccess({})).toBe(true);
    expect(isCreateSuccess({ error: undefined })).toBe(true);
    expect(isCreateSuccess({ error: null })).toBe(true);
  });

  it("is false for an error or no result", () => {
    expect(isCreateSuccess({ error: "Slug taken" })).toBe(false);
    expect(isCreateSuccess(null)).toBe(false);
    expect(isCreateSuccess(undefined)).toBe(false);
  });
});

describe("createSuccessToast", () => {
  it("names the item and links to it when there is a URL", () => {
    expect(createSuccessToast({ noun: "Campaign", name: " Spring sale ", href: "/dashboard/campaigns/cmp_1" })).toEqual({
      title: "Campaign created",
      description: "Spring sale",
      viewHref: "/dashboard/campaigns/cmp_1",
      secret: null,
      persistent: false,
    });
  });

  it("has no View link without a URL", () => {
    expect(createSuccessToast({ noun: "Tag", name: "VIP" }).viewHref).toBeNull();
  });

  it("keeps a one-time secret on screen until dismissed", () => {
    const toast = createSuccessToast({ noun: "App", name: "Realm", secret: "rk_live_123" });
    expect(toast.secret).toBe("rk_live_123");
    expect(toast.persistent).toBe(true);
  });

  it("falls back when the name is blank", () => {
    expect(createSuccessToast({ name: "  " })).toMatchObject({ title: "Created", description: "Untitled" });
  });
});
