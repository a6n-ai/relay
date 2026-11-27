import { ID_SHAPE } from "../shared/ids";

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
