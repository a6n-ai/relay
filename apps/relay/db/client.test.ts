import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.fn((..._args: unknown[]) => ({ options: { parsers: {}, serializers: {} }, end: vi.fn() }));
const context = vi.fn();

vi.mock("postgres", () => ({ default: (...args: unknown[]) => postgresMock(...args) }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => context() }));

async function loadOnWorkers() {
  vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  vi.resetModules();
  return { db: (await import("./client")).db };
}

describe("db on Workers", () => {
  beforeEach(() => {
    process.env.DATABASE_URL ??= "postgres://node/unused";
    postgresMock.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens a Hyperdrive client per request and reuses it within the request", async () => {
    const ctx = {};
    context.mockReturnValue({ env: { HYPERDRIVE: { connectionString: "postgres://h/x" } }, ctx });
    const { db } = await loadOnWorkers();
    void db.select;
    void db.insert;
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith("postgres://h/x", { max: 5, prepare: false });

    context.mockReturnValue({ env: { HYPERDRIVE: { connectionString: "postgres://h/x" } }, ctx: {} });
    void db.select;
    expect(postgresMock).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when the Hyperdrive binding is missing", async () => {
    context.mockReturnValue({ env: {}, ctx: {} });
    const { db } = await loadOnWorkers();
    expect(() => db.select).toThrow("HYPERDRIVE binding missing");
  });
});
