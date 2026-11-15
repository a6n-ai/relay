import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailboxScope } from "./scope";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  where: undefined as SQL | undefined,
}));

vi.mock("@/db/client", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    from: self,
    leftJoin: self,
    orderBy: self,
    limit: self,
    where: (w: SQL) => {
      state.where = w;
      return chain;
    },
    then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.rows).then(resolve, reject),
  });
  return { db: { select: () => chain } };
});

const { listMailboxLetters, listMailboxThread, readMailboxLetter } = await import("./list");

const client: MailboxScope = { organizationId: "org_client", tenantIds: [7n, 9n], includeOperatorMail: false };
const platform: MailboxScope = { organizationId: "org_a6n", tenantIds: [7n], includeOperatorMail: true };
const empty: MailboxScope = { organizationId: "org_empty", tenantIds: [], includeOperatorMail: false };

function params(where: SQL | undefined) {
  return new PgDialect().sqlToQuery(where!).params;
}

describe("mailbox scope in the query layer", () => {
  beforeEach(() => {
    state.rows = [{ publicId: "eml_1" }];
    state.where = undefined;
  });

  it("returns no rows and runs no query when the scope admits nothing", async () => {
    await expect(listMailboxLetters(empty)).resolves.toEqual([]);
    await expect(listMailboxThread(empty, "t")).resolves.toEqual([]);
    await expect(readMailboxLetter(empty, "eml_1")).resolves.toBeNull();
    expect(state.where).toBeUndefined();
  });

  it("limits a client workspace to its own tenants, never operator mail", async () => {
    await listMailboxLetters(client);
    expect(params(state.where)).toEqual([7n, 9n]);
    expect(new PgDialect().sqlToQuery(state.where!).sql).not.toContain("is null");
  });

  it("adds operator mail only inside the platform workspace", async () => {
    await listMailboxLetters(platform);
    expect(new PgDialect().sqlToQuery(state.where!).sql).toContain("is null");
    expect(params(state.where)).toEqual([7n]);
  });

  it("shows only operator mail to a platform scope with no tenants", async () => {
    await listMailboxLetters({ ...platform, tenantIds: [] });
    const { sql, params: p } = new PgDialect().sqlToQuery(state.where!);
    expect(sql).toContain("is null");
    expect(sql).not.toContain(" in ");
    expect(p).toEqual([]);
  });

  it("replaces the scope with the active app filter when it is in scope", async () => {
    await listMailboxLetters(client, { tenantId: 9n });
    expect(params(state.where)).toEqual([9n]);
    expect(new PgDialect().sqlToQuery(state.where!).sql).not.toContain(" in ");
  });

  it("returns no rows when the active app is outside the scope", async () => {
    await expect(listMailboxLetters(client, { tenantId: 8n })).resolves.toEqual([]);
    expect(state.where).toBeUndefined();
  });

  it("keeps the thread and single-letter reads inside the scope", async () => {
    await readMailboxLetter(client, "eml_1");
    expect(params(state.where)).toEqual(["eml_1", 7n, 9n]);
    await expect(readMailboxLetter(client, "eml_1")).resolves.toEqual(state.rows[0]);
    await listMailboxThread(client, "thread-1");
    expect(params(state.where)).toEqual(["thread-1", 7n, 9n]);
  });
});
