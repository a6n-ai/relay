import { integer, text } from "drizzle-orm/sqlite-core";
import { newId } from "../shared/ids";

// better-auth writes Date values to *_at columns; timestamp_ms maps them to epoch-ms integers.
export const id = (prefix: string) => text("id").primaryKey().$defaultFn(() => newId(prefix));
export const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
export const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());
export const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
export const flag = (name: string) => integer(name, { mode: "boolean" });
