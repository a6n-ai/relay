import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailboxScope } from "./scope";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
}));

vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/lib/auth/active-org", () => ({ getActiveOrganizationId: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
vi.mock("@/lib/auth/guards", () => ({ activeMember: async () => null }));
vi.mock("@/lib/services/tenants.service", () => ({ tenantsService: { listRecent: async () => ({ items: [] }) } }));
vi.mock("./access", () => ({
  mailboxAccess: async () => "all",
  canSeeMailbox: (access: "all" | bigint[], mailboxId: bigint | null) =>
    access === "all" || (mailboxId !== null && access.includes(mailboxId)),
}));

vi.mock("@/db/client", () => {
  const chain = (): unknown => ({
    innerJoin: () => chain(),
    where: () => chain(),
    limit: async () => state.rows,
  });
  return { db: { select: () => ({ from: () => chain() }) } };
});

const { readAttachment } = await import("./attachments");

const attachmentRow = {
  publicId: "att_1",
  filename: "invoice.pdf",
  contentType: "application/pdf",
  sizeBytes: 10,
  storageKey: "mail/att_1",
  letterPublicId: "eml_1",
  tenantId: 7n,
  mailboxId: 11n,
};

describe("readAttachment", () => {
  beforeEach(() => {
    state.rows = [attachmentRow];
  });

  it("returns an attachment of a letter in a granted mailbox", async () => {
    const scope: MailboxScope = { organizationId: "org_client", tenantIds: [7n], includeOperatorMail: false, mailboxIds: [11n] };
    await expect(readAttachment(scope, "att_1")).resolves.toMatchObject({ letter: { publicId: "eml_1" } });
  });

  it("member without a grant cannot download an attachment", async () => {
    const scope: MailboxScope = { organizationId: "org_client", tenantIds: [7n], includeOperatorMail: false, mailboxIds: [12n] };
    await expect(readAttachment(scope, "att_1")).resolves.toBeNull();
  });
});
