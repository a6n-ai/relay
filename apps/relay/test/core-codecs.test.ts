import { describe, expect, it } from "vitest";
import { inChunks } from "../src/core/chunks";
import { constantTimeEqual, fromBase64Url, hmacSha256, toBase64, toBase64Url } from "../src/core/crypto";
import { decodeCursor, encodeCursor, keysetBefore, keysetSlice, parseCursor } from "../src/core/cursor";
import { ownedBy, ownedRaw, r2Keys } from "../src/core/r2-keys";
import { unsubscribeToken } from "../src/core/unsubscribe";
import { signBody } from "../src/core/webhook-crypto";

describe("signature formats stay byte-identical", () => {
  it("webhook body signature is hex HMAC-SHA256", async () => {
    expect(await signBody("s3cret", '{"a":1}')).toBe("5910e62016ef5034272c926c27071992a465c2335cecf41851bda071577f4f6d");
  });
  it("unsubscribe token carries a base64url HMAC", async () => {
    expect(await unsubscribeToken("unsub-secret", "wsp_a", "msg_1")).toBe("wsp_a.msg_1.2r3ofSmAPcFNchtANmqn6Xp4iJ48J2s5FKUexOHYs_w");
  });
  it("base64 helpers round trip and chunk large input", async () => {
    expect(toBase64(await hmacSha256("k", "x"))).toBe("w47ciBXISJ9kc4l49EAI+FljRVRfC6po72/PXFPlcYk=");
    expect(toBase64Url(fromBase64Url("w47ciBXISJ9kc4l49EAI-FljRVRfC6po72_PXFPlcYk"))).toBe("w47ciBXISJ9kc4l49EAI-FljRVRfC6po72_PXFPlcYk");
    expect(toBase64(new Uint8Array(200_000)).length).toBe(Math.ceil(200_000 / 3) * 4);
  });
  it("constantTimeEqual compares length and content", () => {
    const b = (s: string) => new TextEncoder().encode(s);
    expect(constantTimeEqual(b("Bearer a"), b("Bearer a"))).toBe(true);
    expect(constantTimeEqual(b("Bearer a"), b("Bearer b"))).toBe(false);
    expect(constantTimeEqual(b("Bearer a"), b(""))).toBe(false);
    expect(constantTimeEqual(b("Bearer a"), b("Bearer aa"))).toBe(false);
  });
});

describe("r2 keys", () => {
  it("keeps the stored layout", () => {
    expect(r2Keys.msgHtml("w", "m")).toBe("ws/w/msg/m.html");
    expect(r2Keys.payload("w", "m")).toBe("ws/w/msg/m.received.json");
    expect(r2Keys.attachment("w", "m", 2, "a.pdf")).toBe("ws/w/att/m/2-a.pdf");
    expect(r2Keys.raw("w", "2026-11-05T01:02:03.000Z", "u")).toBe("ws/w/raw/2026/11/u.eml");
  });
  it("guards by workspace prefix", () => {
    expect(ownedBy("w", "ws/w/msg/m.html")).toBe(true);
    expect(ownedBy("w", "ws/w2/msg/m.html")).toBe(false);
    expect(ownedRaw("w", "ws/w/raw/2026/11/u.eml")).toBe(true);
    expect(ownedRaw("w", "ws/w/msg/m.html")).toBe(false);
  });
});

const ID5 = `msg_${"5".repeat(12)}`;

describe("keyset pagination", () => {
  it("slices one extra row into a next cursor", () => {
    const rows = [3, 2, 1].map((n) => ({ createdAt: n, id: `msg_${String(n).repeat(12)}` }));
    const { page, nextCursor } = keysetSlice(rows, 2);
    expect(page).toHaveLength(2);
    expect(decodeCursor(nextCursor!)).toEqual({ createdAt: 2, id: `msg_${"2".repeat(12)}` });
    expect(keysetSlice(rows, 3).nextCursor).toBeNull();
  });
  it("rejects a malformed cursor and builds the clause", () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(() => parseCursor("nope")).toThrow("invalid cursor");
    const after = parseCursor(encodeCursor(5, ID5))!;
    expect(keysetBefore(after, "m.created_at", "m.id")).toEqual({
      sql: "(m.created_at < ? OR (m.created_at = ? AND m.id < ?))",
      bindings: [5, 5, ID5],
    });
  });
});

describe("inChunks", () => {
  it("runs sequential chunks of at most the size", async () => {
    const seen: number[] = [];
    await inChunks(Array.from({ length: 200 }, (_, i) => i), async (p) => seen.push(p.length));
    expect(seen).toEqual([90, 90, 20]);
  });
});
