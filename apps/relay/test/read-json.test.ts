import { describe, expect, it } from "vitest";
import { readJson } from "../src/api/route";
import { RelayError } from "../src/shared/errors";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("https://relay.test/api/v1/messages", { method: "POST", body, headers });

const status = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof RelayError ? e.status : e));

describe("readJson", () => {
  it("parses a body under the cap and returns undefined for bad JSON", async () => {
    expect(await readJson(post('{"a":1}'), 100)).toEqual({ a: 1 });
    expect(await readJson(post("{nope"), 100)).toBeUndefined();
  });

  it("refuses a declared length over the cap before reading", async () => {
    expect(await status(readJson(post("{}", { "content-length": "101" }), 100))).toBe(413);
  });

  it("refuses a chunked body once the bytes read pass the cap", async () => {
    const chunk = new TextEncoder().encode("x".repeat(60));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(chunk);
        c.enqueue(chunk);
        c.close();
      },
    });
    expect(await status(readJson(post(stream), 100))).toBe(413);
  });
});
