import { DurableObject } from "cloudflare:workers";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { Env } from "../env";
import * as schema from "./client-schema";
import { migrate } from "./migrations";

export class ClientDO extends DurableObject<Env> {
  readonly db: DrizzleSqliteDODatabase<typeof schema>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = drizzle(ctx.storage, { schema });
    ctx.blockConcurrencyWhile(async () => {
      migrate(ctx.storage);
    });
  }

  ping(): string {
    return "ok";
  }
}
