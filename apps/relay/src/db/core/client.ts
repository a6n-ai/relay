import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../../env";
import * as schema from "./schema";

export function coreDb(env: Env) {
  return drizzle(env.CORE_DB, { schema });
}
