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
    expect(result.tables).toEqual(expect.arrayContaining(["message", "suppression"]));
    expect(result.tables).not.toContain("audit_log");
  });

  it("fresh DO reaches the latest schema_version with message_event and the inbound tables", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-v3"));
    const result = await runInDurableObject(stub, (_instance, state) => ({
      version: state.storage.kv.get<number>("schema_version"),
      tables: tables(state.storage.sql),
    }));
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.tables).toEqual(
      expect.arrayContaining(["message_event", "attachment", "webhook", "webhook_delivery", "inbound_failure"]),
    );
  });

  it("upgrades a version-1 DO in place, keeping rows with null ses_region", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-upgrade"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const { storage } = state;
      for (const table of ["template", "automation_run", "automation", "audience_hook", "campaign", "marketing_optout", "contact_list_member", "contact_list", "inbound_failure", "webhook_delivery", "webhook", "attachment", "message_event", "message", "suppression", "audit_log"])
        storage.sql.exec(`DROP TABLE IF EXISTS ${table}`);
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
    expect(result).toEqual({ version: CLIENT_MIGRATIONS.length, sesRegion: null });
  });

  it("upgrades a version-2 DO in place, keeping rows with null inbound columns", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-upgrade-v2"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const { storage } = state;
      for (const table of ["template", "automation_run", "automation", "audience_hook", "campaign", "marketing_optout", "contact_list_member", "contact_list", "inbound_failure", "webhook_delivery", "webhook", "attachment", "message_event", "message", "suppression", "audit_log"])
        storage.sql.exec(`DROP TABLE IF EXISTS ${table}`);
      storage.kv.delete("schema_version");
      storage.transactionSync(() => {
        storage.sql.exec(CLIENT_MIGRATIONS[0]);
        storage.sql.exec(CLIENT_MIGRATIONS[1]);
        storage.kv.put("schema_version", 2);
      });
      storage.sql.exec(
        "INSERT INTO message (id, app_id, direction, stream, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        "msg_old000000001", "app_1", "out", "transactional", "sent", 1, 1,
      );
      const version = migrate(storage);
      const row = storage.sql
        .exec<{ address_id: string | null; rfc_message_id: string | null }>(
          "SELECT address_id, rfc_message_id FROM message WHERE id = ?",
          "msg_old000000001",
        )
        .one();
      return { version, addressId: row.address_id, rfcMessageId: row.rfc_message_id };
    });
    expect(result).toEqual({ version: CLIENT_MIGRATIONS.length, addressId: null, rfcMessageId: null });
  });

  it("enforces Message-ID uniqueness for inbound rows per app, and never for outbound rows", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-rfc-unique"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const insert = (id: string, direction: string, rfc: string) =>
        state.storage.sql.exec(
          "INSERT INTO message (id, app_id, direction, stream, status, created_at, updated_at, rfc_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          id, "app_1", direction, "transactional", "sent", 1, 1, rfc,
        );
      const attempt = (fn: () => void) => {
        try {
          fn();
          return null;
        } catch (err) {
          return err instanceof Error ? err.message : String(err);
        }
      };
      insert("msg_in_1", "in", "<a@x.com>");
      const inbound = attempt(() => insert("msg_in_2", "in", "<a@x.com>"));
      insert("msg_out_1", "out", "<b@x.com>");
      const outbound = attempt(() => insert("msg_out_2", "out", "<b@x.com>"));
      return { inbound, outbound };
    });
    expect(result.inbound).toMatch(/UNIQUE/);
    expect(result.outbound).toBeNull();
  });

  it("rejects a webhook_delivery status outside pending, sent and failed", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-webhook-check"));
    const error = await runInDurableObject(stub, (_instance, state) => {
      try {
        state.storage.sql.exec(
          "INSERT INTO webhook_delivery (id, webhook_id, app_id, message_id, event, payload_key, status, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          "whd_1", "whk_1", "app_1", "msg_1", "mailbox.received", "ws/w/msg/m.received.json", "queued", 1, 1, 1,
        );
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    });
    expect(error).toMatch(/CHECK/);
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

describe("ClientDO migration 6 (contact lists and campaigns)", () => {
  it("pins nine scripts and creates the list, member, opt-out and campaign tables with the message columns", async () => {
    expect(CLIENT_MIGRATIONS.length).toBe(9);
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-six"));
    const result = await runInDurableObject(stub, (_instance, state) => ({
      version: state.storage.kv.get<number>("schema_version"),
      tables: tables(state.storage.sql),
      messageColumns: state.storage.sql.exec<{ name: string }>("PRAGMA table_info('message')").toArray().map((r) => r.name),
      memberColumns: state.storage.sql.exec<{ name: string }>("PRAGMA table_info('contact_list_member')").toArray().map((r) => r.name),
    }));
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.tables).toEqual(expect.arrayContaining(["contact_list", "contact_list_member", "marketing_optout", "campaign"]));
    expect(result.memberColumns).not.toContain("unsubscribed_at");
    expect(result.messageColumns).toEqual(expect.arrayContaining(["unsubscribed_at", "merge_data"]));
  });

  it("upgrades a version-5 DO to 6 in place, keeping existing rows", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-five"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const { storage } = state;
      for (const table of ["template", "automation_run", "automation", "audience_hook", "campaign", "marketing_optout", "contact_list_member", "contact_list"]) storage.sql.exec(`DROP TABLE IF EXISTS ${table}`);
      storage.sql.exec("ALTER TABLE message DROP COLUMN unsubscribed_at");
      storage.sql.exec("ALTER TABLE message DROP COLUMN merge_data");
      storage.sql.exec("ALTER TABLE message DROP COLUMN reply_to");
      storage.sql.exec("INSERT INTO suppression (email, reason, stream, created_at) VALUES ('keep@x.test', 'manual', NULL, 1)");
      storage.kv.put("schema_version", 5);
      const before = applied.count;
      const version = migrate(storage);
      return {
        version,
        delta: applied.count - before,
        kept: storage.sql.exec<{ email: string }>("SELECT email FROM suppression").toArray().map((r) => r.email),
        tables: tables(storage.sql),
      };
    });
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.delta).toBe(4);
    expect(result.kept).toEqual(["keep@x.test"]);
    expect(result.tables).toEqual(expect.arrayContaining(["contact_list", "contact_list_member", "campaign"]));
  });
});

describe("ClientDO migration 7", () => {
  it("adds the template, automation and audience_hook tables and campaign audience columns", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-v7-fresh"));
    const result = await runInDurableObject(stub, (_instance, state) => ({
      version: state.storage.kv.get<number>("schema_version"),
      tables: tables(state.storage.sql),
      campaignCols: state.storage.sql.exec<{ name: string }>("PRAGMA table_info('campaign')").toArray().map((r) => r.name),
    }));
    expect(CLIENT_MIGRATIONS.length).toBe(9);
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.tables).toEqual(expect.arrayContaining(["template", "automation", "automation_run", "audience_hook"]));
    expect(result.campaignCols).toContain("audience_kind");
  });

  it("upgrades a version-6 DO, keeping a campaign row on the lists audience", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-v6-upgrade"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const { storage } = state;
      storage.sql.exec("DROP TABLE IF EXISTS template");
      storage.sql.exec("DROP TABLE IF EXISTS automation_run");
      storage.sql.exec("DROP TABLE IF EXISTS automation");
      storage.sql.exec("DROP TABLE IF EXISTS audience_hook");
      storage.sql.exec("DROP INDEX IF EXISTS campaign_import_ref");
      storage.sql.exec("DROP INDEX IF EXISTS contact_list_import_ref");
      storage.sql.exec("ALTER TABLE campaign DROP COLUMN audience_kind");
      storage.sql.exec("ALTER TABLE campaign DROP COLUMN audience_query");
      storage.sql.exec("ALTER TABLE campaign DROP COLUMN template_id");
      storage.sql.exec("ALTER TABLE campaign DROP COLUMN import_ref");
      storage.sql.exec("ALTER TABLE contact_list DROP COLUMN import_ref");
      storage.sql.exec("ALTER TABLE message DROP COLUMN reply_to");
      storage.kv.put("schema_version", 6);
      storage.sql.exec("INSERT INTO campaign (id, app_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", "cmp_old000000001", "app_1", "Old", 1, 1);
      const version = migrate(storage);
      const row = storage.sql.exec<{ audience_kind: string }>("SELECT audience_kind FROM campaign WHERE id = ?", "cmp_old000000001").one();
      return { version, audienceKind: row.audience_kind, tables: tables(storage.sql) };
    });
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.audienceKind).toBe("lists");
    expect(result.tables).toEqual(expect.arrayContaining(["template", "automation"]));
  });
});

describe("ClientDO migration 8", () => {
  it("upgrades a version-7 DO by adding message.reply_to, keeping rows", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("migrate-v7-upgrade"));
    const result = await runInDurableObject(stub, (_instance, state) => {
      const { storage } = state;
      storage.sql.exec("ALTER TABLE message DROP COLUMN reply_to");
      storage.sql.exec("INSERT INTO suppression (email, reason, stream, created_at) VALUES ('keep8@x.test', 'manual', NULL, 1)");
      storage.kv.put("schema_version", 7);
      const version = migrate(storage);
      return {
        version,
        cols: storage.sql.exec<{ name: string }>("PRAGMA table_info('message')").toArray().map((r) => r.name),
        kept: storage.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM suppression WHERE email = 'keep8@x.test'").one().n,
      };
    });
    expect(result.version).toBe(CLIENT_MIGRATIONS.length);
    expect(result.cols).toContain("reply_to");
    expect(result.kept).toBe(1);
  });
});
