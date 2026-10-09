import { describe, expect, it } from "vitest";
import { autosaveReducer, retryDelayMs, type SaveState } from "./autosave";
import { fillSamples } from "./samples";

const idle: SaveState = { status: "idle", attempt: 0 };

describe("autosaveReducer", () => {
  it("goes dirty → saving → saved with a timestamp", () => {
    let s = autosaveReducer(idle, { type: "edit" });
    expect(s.status).toBe("dirty");
    s = autosaveReducer(s, { type: "start" });
    expect(s.status).toBe("saving");
    s = autosaveReducer(s, { type: "ok", at: 1000 });
    expect(s).toEqual({ status: "saved", savedAt: 1000, attempt: 0 });
  });
  it("counts failed attempts and resets on success", () => {
    let s = autosaveReducer({ status: "saving", attempt: 0 }, { type: "fail" });
    expect(s).toMatchObject({ status: "error", attempt: 1 });
    s = autosaveReducer(autosaveReducer(s, { type: "start" }), { type: "ok", at: 5 });
    expect(s.attempt).toBe(0);
  });
  it("a conflict is sticky until reload", () => {
    const s = autosaveReducer({ status: "saving", attempt: 0 }, { type: "conflict" });
    expect(autosaveReducer(s, { type: "edit" }).status).toBe("conflict");
  });
  it("an edit made while a save was in flight keeps the editor dirty after that save succeeds", () => {
    let s = autosaveReducer({ status: "dirty", attempt: 0 }, { type: "start" });
    s = autosaveReducer(s, { type: "edit" });
    s = autosaveReducer(s, { type: "ok", at: 9, stale: true });
    expect(s).toEqual({ status: "dirty", savedAt: 9, attempt: 0 });
  });
  it("an edit during an error keeps the attempt count", () => {
    expect(autosaveReducer({ status: "error", attempt: 2 }, { type: "edit" })).toEqual({ status: "dirty", attempt: 2 });
  });
});

describe("retryDelayMs", () => {
  it("backs off 2s, 4s, 8s then gives up", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([2000, 4000, 8000, null]);
  });
});

describe("fillSamples", () => {
  const samples = { "contact.first_name": "Priya" };
  it("fills sample values", () => expect(fillSamples("Hi {{contact.first_name|there}}", samples, "sample")).toBe("Hi Priya"));
  it("uses fallbacks when values are missing", () =>
    expect(fillSamples("Hi {{contact.first_name|there}}", samples, "missing")).toBe("Hi there"));
  it("stretches values for the long-name check", () =>
    expect(fillSamples("{{contact.first_name}}", samples, "long").length).toBeGreaterThanOrEqual(40));
});
