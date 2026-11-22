import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailboxScope } from "./scope";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  queries: 0,
  process: vi.fn(async (_msg: unknown) => ({ outcome: "inserted" as const })),
}));

vi.mock("@/db/client", () => {
  const chain = (): unknown => ({
    from: () => chain(),
    where: () => chain(),
    orderBy: () => chain(),
    limit: () => chain(),
    then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.rows).then(resolve, reject),
  });
  return {
    db: {
      select: () => {
        state.queries++;
        return chain();
      },
      delete: () => chain(),
    },
  };
});

vi.mock("./process-queued", () => ({
  processQueuedInbound: (msg: unknown) => state.process(msg),
}));

const { countInboundFailures, listInboundFailures, readInboundFailure, retryInboundFailure } = await import("./failures");

const member: MailboxScope = { organizationId: "org_client", tenantIds: [7n], includeOperatorMail: false, mailboxIds: [] };
const admin: MailboxScope = { ...member, mailboxIds: "all" };

describe("inbound failures", () => {
  beforeEach(() => {
    state.rows = [{ publicId: "imf_1", organizationId: "org_client", rawKey: "raw/abc.eml", envelopeFrom: "a@x", envelopeTo: "b@y", authResults: null, receivedAt: 1 }];
    state.queries = 0;
    state.process.mockClear();
  });

  it("members never see inbound failures", async () => {
    await expect(countInboundFailures(member)).resolves.toBe(0);
    await expect(listInboundFailures(member)).resolves.toEqual([]);
    await expect(readInboundFailure(member, "imf_1")).resolves.toBeNull();
    await expect(retryInboundFailure(member, "imf_1")).resolves.toBeNull();
    expect(state.queries).toBe(0);
    expect(state.process).not.toHaveBeenCalled();
  });

  it("an owner or admin still reads the workspace failure", async () => {
    await expect(readInboundFailure(admin, "imf_1")).resolves.toMatchObject({ publicId: "imf_1" });
  });
});
