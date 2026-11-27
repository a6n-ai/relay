import { customAlphabet } from "nanoid";

const ID_LENGTH = 12;
const body = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-", ID_LENGTH);

// The shape newId produces; the cursor decoder uses it to reject a forged id.
export const ID_SHAPE = new RegExp(`^[a-z]{3}_[0-9A-Za-z_-]{${ID_LENGTH}}$`);

export function newId(prefix: string): string {
  if (!/^[a-z]{3}$/.test(prefix)) throw new Error("id prefix must be exactly 3 lowercase letters");
  return `${prefix}_${body()}`;
}
