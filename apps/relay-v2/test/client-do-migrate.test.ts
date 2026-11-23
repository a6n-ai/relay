import { env, runInDurableObject } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { CLIENT_MIGRATIONS, applied, migrate } from "../src/do/migrations";
import { applyMigrations } from "./migrate";


beforeAll(async () => {
  await applyMigrations();
});

const tables = (sql: SqlStorage) =>
  sql
    .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' ORDER BY name")
    .toArray()
    .map((r) => r.name);

describe("ClientDO migrations", () => {
  it("migrates a fresh DO to the latest version with the three tables", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-fresh"));
    const result = await runInDurableObject(stub, (_instance, state) => ({
      version: state.storage.kv.get<number>("schema_version"),
      tables: tables(state.storage.sql),
    }));
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.tables).toEqual(expect.arrayContaining(["audit_log", "message", "suppression"]));
  });

  it("is a no-op when run again", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-rerun"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const before = applied.count;
      const version = migrate(state.storage);
      return { version, applied: applied.count - before };
    });
    expect(result).toEqual({ version: CLIENT_MIGRATIONS.length, applied: 0 });
  });

  it("applies migrations once when two requests hit a fresh DO", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-concurrent"));
    const before = { count: applied.count, calls: applied.calls };
    const results = await Promise.all([stub.ping("migrate-concurrent"), stub.ping("migrate-concurrent")]);
    expect(results).toEqual([{ version: CLIENT_MIGRATIONS.length }, { version: CLIENT_MIGRATIONS.length }]);
    const after = await runInDurableObject(stub, (_instance, state) => ({
      count: applied.count,
      calls: applied.calls,
      version: state.storage.kv.get<number>("schema_version"),
    }));
    expect(after.calls - before.calls).toBe(1);
    expect(after.count - before.count).toBe(CLIENT_MIGRATIONS.length);
    expect(after.version).toBe(CLIENT_MIGRATIONS.length);
  });
});
