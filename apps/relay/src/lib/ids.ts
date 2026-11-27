import { customAlphabet } from "nanoid";

const body = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-", 12);

export function newId(prefix: string): string {
  if (!/^[a-z]{3}$/.test(prefix)) throw new Error("id prefix must be exactly 3 lowercase letters");
  return `${prefix}_${body()}`;
}
