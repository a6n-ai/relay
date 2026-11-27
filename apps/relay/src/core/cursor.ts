import { ID_SHAPE } from "../shared/ids";
import { RelayError } from "../shared/errors";

export function encodeCursor(createdAt: number, id: string): string {
  return `${createdAt}.${id}`;
}

export function decodeCursor(raw: string): { createdAt: number; id: string } | null {
  const dot = raw.indexOf(".");
  if (dot < 1) return null;
  const ts = raw.slice(0, dot);
  const id = raw.slice(dot + 1);
  if (!/^\d{1,15}$/.test(ts) || !ID_SHAPE.test(id)) return null;
  return { createdAt: Number(ts), id };
}

type Cursor = { createdAt: number; id: string };

export function parseCursor(raw: string | undefined): Cursor | null {
  if (raw === undefined) return null;
  const cursor = decodeCursor(raw);
  if (!cursor) throw new RelayError("invalid cursor");
  return cursor;
}

// Newest first: rows strictly after the cursor in (created_at DESC, id DESC) order.
export function keysetBefore(after: Cursor, createdAt = "created_at", id = "id"): { sql: string; bindings: unknown[] } {
  return {
    sql: `(${createdAt} < ? OR (${createdAt} = ? AND ${id} < ?))`,
    bindings: [after.createdAt, after.createdAt, after.id],
  };
}

// `fetched` holds up to pageSize + 1 rows; the extra one only says there is a next page.
export function keysetSlice<T extends Cursor>(fetched: T[], pageSize: number): { page: T[]; nextCursor: string | null } {
  const page = fetched.slice(0, pageSize);
  const last = page[page.length - 1];
  return { page, nextCursor: fetched.length > pageSize && last ? encodeCursor(last.createdAt, last.id) : null };
}
