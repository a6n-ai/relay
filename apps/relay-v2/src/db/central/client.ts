import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../../env";
import * as schema from "./schema";

export function centralDb(env: Env) {
  return drizzle(env.CENTRAL, { schema });
}
