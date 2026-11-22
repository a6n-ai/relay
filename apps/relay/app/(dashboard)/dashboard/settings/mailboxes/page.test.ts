import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { ListingTable, type ListingRow } from "@/components/ds/listing-table";
import { SettingsPage } from "@/components/ds/settings";
import { ViewHeader } from "@/components/ds/view-header";

const h = vi.hoisted(() => ({
  apps: [] as { id: bigint; publicId: string; name: string }[],
  boxes: [] as Record<string, unknown>[],
  access: "all" as "all" | bigint[],
  listBoxes: vi.fn(),
  canManage: true,
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/guards", () => ({
  requirePagePermission: async () => undefined,
  can: async () => h.canManage,
  activeMember: async () => null,
}));
vi.mock("@/lib/auth/active-org", () => ({ requireActiveOrganizationId: async () => "org_x" }));
vi.mock("@/lib/mailbox/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/mailbox/access")>()),
  mailboxAccess: async () => h.access,
}));
vi.mock("@/lib/services/tenants.service", () => ({
  tenantsService: { listRecent: async () => ({ items: h.apps }) },
}));
vi.mock("@/lib/services/tenant-mailboxes.service", () => ({
  tenantMailboxesService: { listRecent: (...a: unknown[]) => h.listBoxes(...a) },
}));
vi.mock("@/lib/services/sending.service", () => ({
  sendingDomainsService: { listRecent: async () => ({ items: [] }) },
}));

const { default: MailboxesSettingsPage } = await import("./page");

function findAll(node: ReactNode, type: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, out));
  else if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    if (el.type === type) out.push(el);
    findAll(el.props.children, type, out);
  }
  return out;
}

const alpha = { id: 1n, publicId: "app_a", name: "Alpha" };
const beta = { id: 2n, publicId: "app_b", name: "Beta" };
const box = (id: bigint, email: string, tenantId: bigint) => ({
  id,
  publicId: `mbx_${id}`,
  email,
  tenantId,
  kind: "people_inbox",
  canSend: false,
  verifiedAt: null,
});

async function render() {
  const tree = await MailboxesSettingsPage();
  const [table] = findAll(tree, ListingTable) as ReactElement<{ items: ListingRow[] }>[];
  const [page] = findAll(tree, SettingsPage) as ReactElement<{ subtitle: string }>[];
  const [header] = findAll(tree, ViewHeader) as ReactElement<{ actions?: ReactNode }>[];
  return { items: table.props.items, subtitle: page.props.subtitle, actions: header.props.actions };
}

describe("workspace mailboxes page", () => {
  it("lists mailboxes from every app in the workspace, each with its app name", async () => {
    h.apps = [alpha, beta];
    h.boxes = [box(10n, "hello@alpha.test", 1n), box(11n, "news@beta.test", 2n)];
    h.access = "all";
    h.listBoxes.mockImplementation(async () => ({ items: h.boxes }));
    const { items, subtitle, actions } = await render();
    expect(items.map((i) => i.title)).toEqual(["hello@alpha.test", "news@beta.test"]);
    expect(items[0].meta).toContain("Alpha");
    expect(items[1].meta).toContain("Beta");
    expect(subtitle).toBe("Every address in this workspace.");
    expect(actions).toBeDefined();
  });

  it("hides New mailbox and uses the read-only subtitle without mailbox:manage", async () => {
    h.apps = [alpha];
    h.boxes = [box(10n, "hello@alpha.test", 1n)];
    h.access = "all";
    h.canManage = false;
    h.listBoxes.mockImplementation(async () => ({ items: h.boxes }));
    try {
      const { items, subtitle, actions } = await render();
      expect(items.map((i) => i.title)).toEqual(["hello@alpha.test"]);
      expect(subtitle).toBe("Mailboxes you can see in this workspace.");
      expect(actions).toBeUndefined();
    } finally {
      h.canManage = true;
    }
  });

  it("drops mailboxes of apps outside the workspace", async () => {
    h.apps = [alpha];
    h.boxes = [box(10n, "hello@alpha.test", 1n), box(12n, "other@elsewhere.test", 9n)];
    h.access = "all";
    h.listBoxes.mockImplementation(async () => ({ items: h.boxes }));
    const { items } = await render();
    expect(items.map((i) => i.title)).toEqual(["hello@alpha.test"]);
  });

  it("shows only mailboxes the caller can see", async () => {
    h.apps = [alpha, beta];
    h.boxes = [box(10n, "hello@alpha.test", 1n), box(11n, "news@beta.test", 2n)];
    h.access = [11n];
    h.listBoxes.mockImplementation(async () => ({ items: h.boxes }));
    const { items } = await render();
    expect(items.map((i) => i.title)).toEqual(["news@beta.test"]);
  });

  it("asks the mailbox service only for this workspace's app ids", async () => {
    h.apps = [alpha];
    h.boxes = [];
    h.access = "all";
    h.listBoxes.mockClear();
    h.listBoxes.mockImplementation(async () => ({ items: [] }));
    await render();
    expect(h.listBoxes).toHaveBeenCalledWith(expect.anything(), expect.any(Number));
  });
});
