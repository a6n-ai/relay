import { env, runInDurableObject } from "cloudflare:test";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { beforeAll, describe, expect, it } from "vitest";
import * as clientSchema from "../src/do/client-schema";
import { applyMigrations } from "./migrate";

beforeAll(async () => {
  await applyMigrations();
});

type Column = { name: string; notNull: boolean };

const drizzleTables = Object.values(clientSchema)
  .filter((t) => is(t, SQLiteTable))
  .map((t) => getTableConfig(t as SQLiteTable));

const byName = (a: Column, b: Column) => a.name.localeCompare(b.name);

describe("ClientDO schema drift", () => {
  it("migrations and client-schema.ts describe the same tables and columns", async () => {
    const stub = env.CLIENT.get(env.CLIENT.idFromName("schema-drift"));
    await stub.ping("schema-drift");
    const actual = await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql;
      const names = sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'")
        .toArray()
        .map((r) => r.name)
        .sort();
      const columns: Record<string, Column[]> = {};
      for (const name of names) {
        columns[name] = sql
          .exec<{ name: string; notnull: number }>(`PRAGMA table_info('${name}')`)
          .toArray()
          .map((c) => ({ name: c.name, notNull: c.notnull === 1 }))
          .sort(byName);
      }
      return { names, columns };
    });

    expect(drizzleTables.map((t) => t.name).sort()).toEqual(actual.names);
    for (const table of drizzleTables) {
      const declared = table.columns.map((c) => ({ name: c.name, notNull: c.notNull })).sort(byName);
      expect(declared, table.name).toEqual(actual.columns[table.name]);
    }
  });
});
