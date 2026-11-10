import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isWorkers } from "@foundry/commons/runtime/platform";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Pg = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

const onWorkers = isWorkers();

if (!onWorkers && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* env expected */
  }
}

function nodeDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const globalForDb = globalThis as typeof globalThis & { __relayPg?: Pg };
  const client =
    globalForDb.__relayPg ??
    postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 10 : 4,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: false,
    });
  if (process.env.NODE_ENV !== "production") globalForDb.__relayPg = client;
  return drizzle(client, { schema });
}

// Workers forbid reusing a socket across requests, so each request gets its own
// small client, keyed on its ExecutionContext. Hyperdrive does the real pooling.
const perRequest = new WeakMap<object, Db>();

function requestDb(): Db {
  const { env, ctx } = getCloudflareContext();
  let d = perRequest.get(ctx);
  if (!d) {
    const hd = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    if (!hd) throw new Error("HYPERDRIVE binding missing");
    d = drizzle(postgres(hd.connectionString, { max: 5, prepare: false }), { schema });
    perRequest.set(ctx, d);
  }
  return d;
}

export const db: Db = onWorkers
  ? new Proxy({} as Db, {
      get(_t, prop) {
        const target = requestDb();
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    })
  : nodeDb();
export { schema };
