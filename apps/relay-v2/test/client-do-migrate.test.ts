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

  it("fresh DO reaches schema_version 2 with message_event", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-v2"));
    const result = await runInDurableObject(stub, (_instance, state) => ({
      version: state.storage.kv.get<number>("schema_version"),
      tables: tables(state.storage.sql),
    }));
    expect(result.version).toBe(2);
    expect(result.tables).toContain("message_event");
  });

  it("upgrades a version-1 DO in place, keeping rows with null ses_region", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-upgrade"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const { storage } = state;
      for (const table of ["message_event", "message", "suppression", "audit_log"]) storage.sql.exec(`DROP TABLE IF EXISTS ${table}`);
      storage.kv.delete("schema_version");
      storage.transactionSync(() => {
        storage.sql.exec(CLIENT_MIGRATIONS[0]);
        storage.kv.put("schema_version", 1);
      });
      storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        "msg_old000000001", "app_1", "out", "transactional", "sent", 1, 1,
      );
      const version = migrate(storage);
      const row = storage.sql.exec<{ ses_region: string | null }>("SELECT ses_region FROM message WHERE id = ?", "msg_old000000001").one();
      return { version, sesRegion: row.ses_region };
    });
    expect(result).toEqual({ version: 2, sesRegion: null });
  });

  it("rejects two message_event rows with the same sns_message_id", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-event-unique"));
    const error = await runInDurableObject(stub, (_instance, state) => {
      const insert = (id: string) =>
        state.storage.sql.exec(
          "INSERT INTO message_event (id, message_id, type, sns_message_id, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          id, "msg_1", "Delivery", "sns_dup", 1, 1,
        );
      insert("mev_1");
      try {
        insert("mev_2");
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });
    expect(error).toMatch(/UNIQUE/);
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
