import { env, runInDurableObject, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireActor } from "../src/console/actor";
import { addApp } from "../src/console/apps";
import {
  addAddress,
  addDomain,
  checkDomain,
  listAddresses,
  listDomains,
  removeAddress,
  updateAddress,
} from "../src/console/domains";
import { createAddressGrant } from "../src/core/addresses";
import { refreshWorkspaceLimits, type WorkspaceLimits } from "../src/core/limits";
import { memorySesIdentity } from "../src/core/ses-identity";
import { coreDb } from "../src/db/core/client";
import { address, sendingDomain } from "../src/db/core/schema";
import { securityDb } from "../src/db/security/client";
import { addressGrant, member } from "../src/db/security/schema";
import { addMember, cookieFor, createWorkspace, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

const headersFor = (cookie: string) => new Headers({ cookie });
const WRITE = { permission: { sending: ["write"] }, write: true };

beforeAll(async () => {
  await applyMigrations();
  await SELF.fetch(`${ORIGIN}/sign-in`);
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

async function workspaceFor(email: string, name: string, role: "user" | "admin" = "admin") {
  const cookie = await cookieFor(email, role);
  const workspaceId = await createWorkspace(cookie, name);
  await setActive(cookie, workspaceId);
  return { cookie, workspaceId };
}

const stubFor = (workspaceId: string) => env.CLIENT.get(env.CLIENT.idFromName(workspaceId));
const snapshot = (workspaceId: string) =>
  runInDurableObject(stubFor(workspaceId), (_instance, state) => state.storage.kv.get<WorkspaceLimits>("limits"));

describe("console sending domains and addresses", { timeout: 60_000 }, () => {
  it("normalises a domain, stores it pending in the default region, lists its DKIM records, and refuses another workspace's claim", async () => {
    const a = await workspaceFor("dom-add@example.com", "Dom Add Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id } = await addDomain(env, actor, { domain: "  Dom-Add.TEST. " });

    const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
    expect(row).toMatchObject({ workspaceId: a.workspaceId, domain: "dom-add.test", status: "pending", sesRegion: "ap-south-1" });

    const [listed] = await listDomains(env, actor);
    expect(listed.records).toHaveLength(3);
    expect(listed.records[0]).toMatchObject({ type: "CNAME" });
    expect(listed.records[0].name).toMatch(/\._domainkey\.dom-add\.test$/);
    expect(listed.records[0].value).toMatch(/\.dkim\.amazonses\.com$/);

    const b = await workspaceFor("dom-claim@example.com", "Dom Claim Co");
    const actorB = await requireActor(env, headersFor(b.cookie), WRITE);
    await expect(addDomain(env, actorB, { domain: "dom-add.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain already claimed",
    });
  });

  it("converts a unicode domain to punycode and refuses anything that is not a bare hostname", async () => {
    const a = await workspaceFor("dom-idn@example.com", "Dom Idn Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    await addDomain(env, actor, { domain: "bücher-idn.test" });
    await expect(addDomain(env, actor, { domain: "example-path.test/mail" })).rejects.toMatchObject({ status: 400 });
    await expect(addDomain(env, actor, { domain: "nodot" })).rejects.toMatchObject({ status: 400 });

    const domains = await listDomains(env, actor);
    expect(domains.map((d) => d.domain)).toEqual([expect.stringMatching(/^xn--.*\.test$/)]);
  });

  it("refuses a domain already verified in the shared SES account unless the actor is a platform admin", async () => {
    memorySesIdentity.preset("shared-ses.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
    memorySesIdentity.preset("shared-admin.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });

    const host = await workspaceFor("dom-host@example.com", "Dom Host Co");
    const ownerCookie = await addMember(host.workspaceId, "dom-owner-plain@example.com", "owner");
    const memberActor = await requireActor(env, headersFor(ownerCookie), WRITE);
    await expect(addDomain(env, memberActor, { domain: "shared-ses.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain already registered",
    });
    const rows = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.domain, "shared-ses.test"));
    expect(rows).toHaveLength(0);

    const adminActor = await requireActor(env, headersFor(host.cookie), WRITE);
    const { id } = await addDomain(env, adminActor, { domain: "shared-admin.test" });
    const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
    expect(row).toMatchObject({ workspaceId: host.workspaceId, status: "pending" });
  });

  it("checks a domain against SES and refreshes the limits when its status changes", async () => {
    const a = await workspaceFor("dom-check@example.com", "Dom Check Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id } = await addDomain(env, actor, { domain: "check-me.test" });
    const before = (await snapshot(a.workspaceId))!.fetchedAt;

    memorySesIdentity.preset("check-me.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(checkDomain(env, actor, id)).resolves.toMatchObject({ status: "verified", dkimStatus: "SUCCESS" });
    expect((await snapshot(a.workspaceId))!.fetchedAt).toBeGreaterThan(before);
  });

  it("lists a sender in the limits only while its domain is verified and it can send", async () => {
    const a = await workspaceFor("addr-send@example.com", "Addr Send Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const { id: domainId } = await addDomain(env, actor, { domain: "mail-send.test" });
    const { id } = await addAddress(env, actor, { appId, email: "hi@mail-send.test", kind: "sender", canSend: true });

    expect((await snapshot(a.workspaceId))!.senders).not.toHaveProperty(["hi@mail-send.test"]);
    memorySesIdentity.preset("mail-send.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
    await checkDomain(env, actor, domainId);
    expect((await snapshot(a.workspaceId))!.senders).toHaveProperty(["hi@mail-send.test"]);

    await updateAddress(env, actor, id, { canSend: false });
    expect((await snapshot(a.workspaceId))!.senders).not.toHaveProperty(["hi@mail-send.test"]);
    await expect(listAddresses(env, actor)).resolves.toEqual([
      expect.objectContaining({ id, email: "hi@mail-send.test", appName: "Web", canSend: false }),
    ]);
  });

  it("refuses an address on a domain the workspace does not own", async () => {
    const a = await workspaceFor("addr-foreign@example.com", "Addr Foreign Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await expect(addAddress(env, actor, { appId, email: "hi@other.org", kind: "sender" })).rejects.toMatchObject({
      status: 400,
      message: "address must use one of your domains",
    });
  });

  it("answers 404 for another workspace's address and leaves it unchanged", async () => {
    const a = await workspaceFor("addr-a@example.com", "Addr A Co");
    const b = await workspaceFor("addr-b@example.com", "Addr B Co");
    const actorA = await requireActor(env, headersFor(a.cookie), WRITE);
    const actorB = await requireActor(env, headersFor(b.cookie), WRITE);
    const { id: appB } = await addApp(env, actorB, { name: "Web", slug: "web" });
    await addDomain(env, actorB, { domain: "addr-b-own.test" });
    const { id } = await addAddress(env, actorB, { appId: appB, email: "hi@addr-b-own.test", kind: "inbox" });

    await expect(updateAddress(env, actorA, id, { canSend: true })).rejects.toMatchObject({ status: 404 });
    await expect(removeAddress(env, actorA, id)).rejects.toMatchObject({ status: 404 });
    const [row] = await coreDb(env).select().from(address).where(eq(address.id, id));
    expect(row).toMatchObject({ canSend: false });
  });

  it("removes an address's grants before the address", async () => {
    const a = await workspaceFor("addr-grant@example.com", "Addr Grant Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await addDomain(env, actor, { domain: "grant-own.test" });
    const { id } = await addAddress(env, actor, { appId, email: "g@grant-own.test", kind: "both" });
    const [owner] = await securityDb(env)
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, a.workspaceId));
    await createAddressGrant(env, { workspaceId: a.workspaceId, addressId: id, memberId: owner.id });

    await removeAddress(env, actor, id);
    expect(await securityDb(env).select().from(addressGrant).where(eq(addressGrant.addressId, id))).toHaveLength(0);
    expect(await coreDb(env).select().from(address).where(eq(address.id, id))).toHaveLength(0);
  });

  it("logs only the workspace id when a limits refresh fails, and does not throw", async () => {
    vi.spyOn(env.CLIENT, "get").mockReturnValue({
      refreshLimits: async () => {
        throw new Error("boom g@leak.test");
      },
    } as never);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(refreshWorkspaceLimits(env, "wsp_logs")).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalledWith("refreshLimits failed", "wsp_logs");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("@");
  });
});
