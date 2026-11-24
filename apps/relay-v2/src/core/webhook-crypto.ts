const KEY_ERROR = "webhook key not configured";
const DECRYPT_ERROR = "webhook secret could not be decrypted";
const encoder = new TextEncoder();

let cachedKey: { keyB64: string; key: Promise<CryptoKey> } | undefined;

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Array.from(atob(value), (c) => c.charCodeAt(0)));
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Imported once per isolate; a changed key string gets a fresh import.
function aesKey(keyB64: string | undefined): Promise<CryptoKey> {
  if (!keyB64) throw new Error(KEY_ERROR);
  if (cachedKey?.keyB64 === keyB64) return cachedKey.key;
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromB64(keyB64);
  } catch {
    throw new Error(KEY_ERROR);
  }
  if (raw.length !== 32) throw new Error(KEY_ERROR);
  const key = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  cachedKey = { keyB64, key };
  return key;
}

export function newWebhookSecret(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function encryptSecret(
  keyB64: string | undefined,
  plaintext: string,
  aad: string,
): Promise<string> {
  const key = await aesKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(plaintext),
  );
  return `v1:${toB64(iv)}:${toB64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(
  keyB64: string | undefined,
  stored: string,
  aad: string,
): Promise<string> {
  const key = await aesKey(keyB64);
  const [version, ivB64, ciphertextB64, extra] = stored.split(":");
  if (version !== "v1" || ivB64 === undefined || ciphertextB64 === undefined || extra !== undefined) {
    throw new Error("unknown webhook secret version");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64), additionalData: encoder.encode(aad) },
      key,
      fromB64(ciphertextB64),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error(DECRYPT_ERROR);
  }
}

export async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return toHex(new Uint8Array(signature));
}
