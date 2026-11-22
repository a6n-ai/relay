import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { IssueKeyForm } from "@/app/(dashboard)/dashboard/tenants/tenant-ops-forms";

const h = vi.hoisted(() => ({ canWrite: true }));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/guards", () => ({
  requirePagePermission: async () => undefined,
  can: async () => h.canWrite,
}));
vi.mock("next/navigation", () => ({ notFound: () => undefined }));
vi.mock("@/app/(dashboard)/dashboard/tenants/tenant-ops-forms", () => ({ IssueKeyForm: () => null }));
vi.mock("@/lib/tenants/load-app-settings", () => ({
  loadAppSettings: async () => ({ tenant: { id: 1n, publicId: "app_a", name: "Alpha", slug: "alpha" } }),
}));
vi.mock("@/lib/services/tenants.service", () => ({
  apiKeysService: { list: async () => ({ items: [] }) },
}));

const { default: AppKeysPage } = await import("./page");

function findAll(node: ReactNode, type: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (el.type === type) out.push(el);
    findAll(el.props.children, type, out);
  }
  return out;
}

async function render() {
  const tree = await AppKeysPage({ params: Promise.resolve({ id: "app_a" }) });
  return findAll(tree, IssueKeyForm).length;
}

describe("app access keys page", () => {
  it("shows the issue-key form to callers with tenant:write", async () => {
    h.canWrite = true;
    expect(await render()).toBe(1);
  });

  it("hides the issue-key form without tenant:write", async () => {
    h.canWrite = false;
    try {
      expect(await render()).toBe(0);
    } finally {
      h.canWrite = true;
    }
  });
});
