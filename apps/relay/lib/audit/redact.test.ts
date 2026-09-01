import { describe, expect, it } from "vitest";
import { redactFields } from "./redact";

describe("redactFields", () => {
  it("masks named secrets and leaves other fields", () => {
    expect(
      redactFields(
        {
          host: { from: "a", to: "b" },
          password: { from: "old", to: "new" },
        },
        ["password"],
      ),
    ).toEqual({
      host: { from: "a", to: "b" },
      password: { from: "***", to: "***" },
    });
  });

  it("masks API key hashes, DKIM private keys, and verify tokens", () => {
    const out = redactFields(
      {
        keyHash: { from: "aa", to: "bb" },
        dkimPrivate: { from: "pem1", to: "pem2" },
        verifyToken: { from: "t1", to: "t2" },
      },
      ["keyHash", "dkimPrivate", "verifyToken"],
    );
    expect(out?.keyHash).toEqual({ from: "***", to: "***" });
    expect(out?.dkimPrivate).toEqual({ from: "***", to: "***" });
    expect(out?.verifyToken).toEqual({ from: "***", to: "***" });
  });

  it("returns null when there is no diff", () => {
    expect(redactFields(null, ["password"])).toBeNull();
  });
});
