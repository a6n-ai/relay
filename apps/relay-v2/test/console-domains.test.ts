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
import backfill from "../drizzle/core/0006_address_can_send_follows_kind.sql?raw";
import { addMember, cookieFor, createWorkspace, headersFor, ORIGIN, setActive } from "./console-helpers";
import { applyMigrations } from "./migrate";

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

// Platform users cannot create workspaces, so a non-admin is an owner added to a workspace a platform admin made.
async function plainOwnerIn(hostEmail: string, name: string, email: string) {
  const host = await workspaceFor(hostEmail, name);
  const cookie = await addMember(host.workspaceId, email, "owner");
  return { cookie, workspaceId: host.workspaceId };
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
      message: "domain claimed",
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
    memorySesIdentity.preset("ap-south-1", "shared-ses.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
    memorySesIdentity.preset("ap-south-1", "shared-admin.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });

    const host = await workspaceFor("dom-host@example.com", "Dom Host Co");
    const ownerCookie = await addMember(host.workspaceId, "dom-owner-plain@example.com", "owner");
    const memberActor = await requireActor(env, headersFor(ownerCookie), WRITE);
    await expect(addDomain(env, memberActor, { domain: "shared-ses.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain registered",
    });
    const rows = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.domain, "shared-ses.test"));
    expect(rows).toHaveLength(0);

    const adminActor = await requireActor(env, headersFor(host.cookie), WRITE);
    const { id } = await addDomain(env, adminActor, { domain: "shared-admin.test" });
    const [row] = await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.id, id));
    expect(row).toMatchObject({ workspaceId: host.workspaceId, status: "verified", dkimStatus: "success" });
  });

  it("refuses a non-admin domain squatted in another SES region, even when the default region is free", async () => {
    memorySesIdentity.preset("us-east-1", "squat-east.test", { verified: false, dkimStatus: "PENDING", dkimTokens: [] });
    const a = await plainOwnerIn("dom-squat-host@example.com", "Dom Squat Co", "dom-squat@example.com");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    await expect(addDomain(env, actor, { domain: "squat-east.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain registered",
    });
    expect(await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.domain, "squat-east.test"))).toHaveLength(0);
  });

  it("refuses a non-admin parent or subdomain of a domain another workspace claimed, but not a label-suffix lookalike", async () => {
    const owner = await workspaceFor("dom-parent@example.com", "Dom Parent Co");
    const ownerActor = await requireActor(env, headersFor(owner.cookie), WRITE);
    await addDomain(env, ownerActor, { domain: "parent-claim.test" });
    await addDomain(env, ownerActor, { domain: "mail.child-claim.test" });

    const other = await plainOwnerIn("dom-other-host@example.com", "Dom Other Co", "dom-other@example.com");
    const otherActor = await requireActor(env, headersFor(other.cookie), WRITE);
    await expect(addDomain(env, otherActor, { domain: "mail.parent-claim.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain claimed",
    });
    await expect(addDomain(env, otherActor, { domain: "child-claim.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain claimed",
    });
    await expect(addDomain(env, otherActor, { domain: "badparent-claim.test" })).resolves.toMatchObject({});
  });

  it("maps a sending_domain unique-index race to 409 instead of a 500", async () => {
    const a = await workspaceFor("dom-race@example.com", "Dom Race Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const rival = await workspaceFor("dom-rival@example.com", "Dom Rival Co");
    await coreDb(env).insert(sendingDomain).values({ workspaceId: rival.workspaceId, domain: "race-win.test", sesRegion: "ap-south-1" });

    // A platform admin skips the pre-check, so the insert itself is what meets the rival row.
    await expect(addDomain(env, actor, { domain: "race-win.test" })).rejects.toMatchObject({ status: 409, message: "domain claimed" });
  });

  it("removes the pending row when SES create throws", async () => {
    const a = await plainOwnerIn("dom-sesfail-host@example.com", "Dom SesFail Co", "dom-sesfail@example.com");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    vi.spyOn(memorySesIdentity, "create").mockRejectedValueOnce(new Error("ses unavailable"));

    await expect(addDomain(env, actor, { domain: "ses-fail.test" })).rejects.toThrow("ses unavailable");
    expect(await coreDb(env).select().from(sendingDomain).where(eq(sendingDomain.domain, "ses-fail.test"))).toHaveLength(0);
  });

  it("checks a domain against SES and refreshes the limits when its status changes", async () => {
    const a = await workspaceFor("dom-check@example.com", "Dom Check Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id } = await addDomain(env, actor, { domain: "check-me.test" });
    const before = (await snapshot(a.workspaceId))!.fetchedAt;

    memorySesIdentity.preset("ap-south-1", "check-me.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(checkDomain(env, actor, id)).resolves.toMatchObject({ status: "verified", dkimStatus: "success" });
    expect((await snapshot(a.workspaceId))!.fetchedAt).toBeGreaterThan(before);
  });

  it("lists a sender in the limits only while its domain is verified and it can send", async () => {
    const a = await workspaceFor("addr-send@example.com", "Addr Send Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    const { id: domainId } = await addDomain(env, actor, { domain: "mail-send.test" });
    const { id } = await addAddress(env, actor, { appId, email: "hi@mail-send.test", kind: "sender" });

    expect((await snapshot(a.workspaceId))!.senders).not.toHaveProperty(["hi@mail-send.test"]);
    memorySesIdentity.preset("ap-south-1", "mail-send.test", { verified: true, dkimStatus: "SUCCESS", dkimTokens: [] });
    await checkDomain(env, actor, domainId);
    expect((await snapshot(a.workspaceId))!.senders).toHaveProperty(["hi@mail-send.test"]);

    await expect(listAddresses(env, actor)).resolves.toEqual([
      expect.objectContaining({ id, email: "hi@mail-send.test", appName: "Web", canSend: true }),
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

    await expect(updateAddress(env, actorA, id, { displayName: "X" })).rejects.toMatchObject({ status: 404 });
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

  it("requires a verified domain for an inbox or both address, but lets a sender go out on a pending one", async () => {
    const a = await plainOwnerIn("addr-verify-host@example.com", "Addr Verify Co", "addr-verify@example.com");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await addDomain(env, actor, { domain: "verify-gate.test" });

    await expect(addAddress(env, actor, { appId, email: "in@verify-gate.test", kind: "inbox" })).rejects.toMatchObject({
      status: 409,
      message: "domain not verified",
    });
    await expect(addAddress(env, actor, { appId, email: "both@verify-gate.test", kind: "both" })).rejects.toMatchObject({
      status: 409,
      message: "domain not verified",
    });
    await expect(addAddress(env, actor, { appId, email: "out@verify-gate.test", kind: "sender" })).resolves.toMatchObject({});
  });

  it("maps an address unique-index race to 409 instead of a 500", async () => {
    const a = await workspaceFor("addr-race@example.com", "Addr Race Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await addDomain(env, actor, { domain: "addr-race.test" });
    await coreDb(env).insert(address).values({ workspaceId: a.workspaceId, appId, email: "taken@addr-race.test", kind: "sender" });

    await expect(addAddress(env, actor, { appId, email: "taken@addr-race.test", kind: "sender" })).rejects.toMatchObject({
      status: 409,
      message: "address already exists",
    });
  });

  it("turns sending on for a new sender or both address and off for an inbox", async () => {
    const a = await workspaceFor("addr-cansend@example.com", "Addr Cansend Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await addDomain(env, actor, { domain: "cansend-default.test" });

    const sender = await addAddress(env, actor, { appId, email: "s@cansend-default.test", kind: "sender" });
    const both = await addAddress(env, actor, { appId, email: "b@cansend-default.test", kind: "both" });
    const inbox = await addAddress(env, actor, { appId, email: "i@cansend-default.test", kind: "inbox" });

    const rows = await coreDb(env).select().from(address).where(eq(address.workspaceId, a.workspaceId));
    const canSendById = Object.fromEntries(rows.map((r) => [r.id, r.canSend]));
    expect(canSendById[sender.id]).toBe(true);
    expect(canSendById[both.id]).toBe(true);
    expect(canSendById[inbox.id]).toBe(false);
  });

  it("ignores canSend on add and update: sending follows the kind", async () => {
    const a = await workspaceFor("addr-cansend-off@example.com", "Addr Cansend Off Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await addDomain(env, actor, { domain: "cansend-explicit.test" });
    const flag = async (id: string) => (await coreDb(env).select().from(address).where(eq(address.id, id)))[0].canSend;

    const sender = await addAddress(env, actor, { appId, email: "s@cansend-explicit.test", kind: "sender", canSend: false } as never);
    const inbox = await addAddress(env, actor, { appId, email: "i@cansend-explicit.test", kind: "inbox", canSend: true } as never);
    expect(await flag(sender.id)).toBe(true);
    expect(await flag(inbox.id)).toBe(false);

    await updateAddress(env, actor, sender.id, { canSend: false } as never);
    await updateAddress(env, actor, inbox.id, { canSend: true } as never);
    expect(await flag(sender.id)).toBe(true);
    expect(await flag(inbox.id)).toBe(false);
  });

  it("backfills sending on for send-only and both addresses and off for inboxes", async () => {
    const a = await workspaceFor("addr-backfill@example.com", "Addr Backfill Co");
    const actor = await requireActor(env, headersFor(a.cookie), WRITE);
    const { id: appId } = await addApp(env, actor, { name: "Web", slug: "web" });
    await addDomain(env, actor, { domain: "backfill.test" });
    const s = await addAddress(env, actor, { appId, email: "s@backfill.test", kind: "sender" });
    const b = await addAddress(env, actor, { appId, email: "b@backfill.test", kind: "both" });
    const i = await addAddress(env, actor, { appId, email: "i@backfill.test", kind: "inbox" });
    await coreDb(env).update(address).set({ canSend: false }).where(eq(address.workspaceId, a.workspaceId));
    await coreDb(env).update(address).set({ canSend: true }).where(eq(address.id, i.id));

    await env.CORE_DB.prepare(backfill).run();
    const rows = await coreDb(env).select().from(address).where(eq(address.workspaceId, a.workspaceId));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.canSend]));
    expect(byId).toEqual({ [s.id]: true, [b.id]: true, [i.id]: false });
  });

  it("hides Domains from the billing role and shows it a not-allowed message on a direct visit", async () => {
    const owner = await workspaceFor("dom-nav-owner@example.com", "Dom Nav Co");
    const billing = await addMember(owner.workspaceId, "dom-nav-billing@example.com", "billing");

    const ownerPage = await SELF.fetch(`${ORIGIN}/domains`, { redirect: "manual", headers: { cookie: owner.cookie } });
    expect(ownerPage.status).toBe(200);
    expect(await ownerPage.text()).toContain('href="/domains"');

    const res = await SELF.fetch(`${ORIGIN}/domains`, { redirect: "manual", headers: { cookie: billing } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Not available to your role");
    expect(html).not.toContain('href="/domains"');
  });

  it("shows a member the domains and addresses without add, check, switch or remove controls", async () => {
    const owner = await workspaceFor("dom-ro-owner@example.com", "Dom Ro Co");
    const ownerActor = await requireActor(env, headersFor(owner.cookie), WRITE);
    const { id: appId } = await addApp(env, ownerActor, { name: "Web", slug: "web" });
    await addDomain(env, ownerActor, { domain: "readonly-view.test" });
    await addAddress(env, ownerActor, { appId, email: "hi@readonly-view.test", kind: "sender" });
    const member = await addMember(owner.workspaceId, "dom-ro-member@example.com", "member");

    const ownerHtml = await (await SELF.fetch(`${ORIGIN}/domains`, { redirect: "manual", headers: { cookie: owner.cookie } })).text();
    expect(ownerHtml).toContain("Add domain");
    expect(ownerHtml).toContain("Send only");
    expect(ownerHtml).not.toContain("Can send");

    const res = await SELF.fetch(`${ORIGIN}/domains`, { redirect: "manual", headers: { cookie: member } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("hi@readonly-view.test");
    expect(html).not.toContain("Add domain");
    expect(html).not.toContain("Add address");
    expect(html).not.toContain("Check now");
    expect(html).not.toContain('role="switch"');
  });
});

describe("self-serve sending domain cap", { timeout: 60_000 }, () => {
  it("caps a self-serve workspace at three sending domains and leaves a platform-made workspace alone", async () => {
    const cookie = await cookieFor("dom-cap-self@example.com", "user");
    const selfServe = await createWorkspace(cookie, "Dom Cap Self Co");
    await setActive(cookie, selfServe);
    const actor = await requireActor(env, headersFor(cookie), WRITE);
    await addDomain(env, actor, { domain: "dom-cap-one.test" });
    await addDomain(env, actor, { domain: "dom-cap-two.test" });
    await addDomain(env, actor, { domain: "dom-cap-three.test" });
    await expect(addDomain(env, actor, { domain: "dom-cap-four.test" })).rejects.toMatchObject({
      status: 409,
      message: "domain limit reached",
    });

    const admin = await workspaceFor("dom-cap-admin@example.com", "Dom Cap Admin Co");
    const adminActor = await requireActor(env, headersFor(admin.cookie), WRITE);
    await addDomain(env, adminActor, { domain: "dom-cap-a.test" });
    await addDomain(env, adminActor, { domain: "dom-cap-b.test" });
  });
});
