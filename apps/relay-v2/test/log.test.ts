import { afterEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm";
import { describeError, failureOf, logFailure, recordFailure } from "../src/core/log";

afterEach(() => vi.restoreAllMocks());

describe("describeError", () => {
  it("walks the cause chain and masks emails", () => {
    const root = new Error("D1_ERROR: UNIQUE constraint failed: address.email for sales@a6n.ai");
    const wrapped = new Error("Failed query: insert into address", { cause: root });
    expect(describeError(wrapped)).toBe(
      "Error: Failed query: insert into address <- Error: D1_ERROR: UNIQUE constraint failed: address.email for s***@a6n.ai",
    );
  });

  it("describes a non-Error throw", () => expect(describeError("boom")).toBe("boom"));

  it("drops the bound values drizzle appends after params:", () => {
    const err = new DrizzleQueryError("insert into address (email, display_name) values (?, ?)", ["x@y.com", "Jane Doe"], new Error("D1_ERROR: UNIQUE constraint failed: address.email"));
    const text = describeError(err);
    expect(text).toBe("Error: Failed query: insert into address (email, display_name) values (?, ?) <- Error: D1_ERROR: UNIQUE constraint failed: address.email");
    expect(text).not.toContain("Jane");
  });
});

describe("logFailure", () => {
  it("logs a 4xx as a warning and a 5xx as an error, each on one line with where and status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logFailure("addAddressFn", 409, new Error("address already exists"));
    logFailure("addAddressFn", 500, new TypeError("x is undefined"));
    expect(warn).toHaveBeenCalledWith("addAddressFn 409 Error: address already exists");
    expect(error.mock.calls[0][0]).toMatch(/^addAddressFn 500 TypeError: x is undefined/);
  });
});

describe("recordFailure", () => {
  it("ties the client-facing error to its status and real cause", () => {
    const cause = new Error("db down");
    const sent = recordFailure(new Error("internal error"), 500, cause);
    expect(failureOf(sent)).toEqual({ status: 500, cause });
    expect(failureOf(new Error("other"))).toBeUndefined();
  });
});
