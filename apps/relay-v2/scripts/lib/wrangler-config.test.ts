import { describe, expect, it } from "vitest";
import { missing, parseWranglerJsonc } from "./wrangler-config.ts";

const FIXTURE = `{
  // comment with a "quote" and a , before }
  "name": "relay-v2",
  /* block, with ,] inside */
  "d1_databases": [
    { "binding": "SECURITY_DB", "database_name": "relay-security", "database_id": "local-security", },
    { "binding": "CORE_DB", "database_name": "relay-core", "database_id": "local-core" },
  ],
  "r2_buckets": [{ "binding": "MAIL", "bucket_name": "relay-mail" }],
  "queues": {
    "producers": [{ "binding": "SEND", "queue": "relay-send" }],
    "consumers": [
      { "queue": "relay-send", "dead_letter_queue": "relay-send-dlq" },
      { "queue": "relay-v2-inbound", "dead_letter_queue": "relay-v2-inbound-dlq" },
    ],
  },
  "vars": { "URL": "https://relay.a6n.ai//not-a-comment" },
}`;

describe("parseWranglerJsonc", () => {
  it("reads D1, R2 and queue names through comments and trailing commas", () => {
    const res = parseWranglerJsonc(FIXTURE);
    expect(res.d1).toEqual([
      { binding: "SECURITY_DB", name: "relay-security", id: "local-security" },
      { binding: "CORE_DB", name: "relay-core", id: "local-core" },
    ]);
    expect(res.r2).toEqual(["relay-mail"]);
    expect(res.queues).toEqual(["relay-send", "relay-send-dlq", "relay-v2-inbound", "relay-v2-inbound-dlq"]);
  });
});

describe("missing", () => {
  it("returns only desired names that do not exist yet", () => {
    expect(missing(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
    expect(missing(["a"], ["a", "z"])).toEqual([]);
  });
});
