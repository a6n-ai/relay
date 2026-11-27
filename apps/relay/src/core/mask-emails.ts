// Keeps the first letter of each local part; the domain is left as written, whatever its form (IP literal, IDN).
export const maskEmails = (text: string) =>
  text.replace(/([^\s@<>"(),;:]+)@/g, (_, local: string) => `${[...local][0]}***@`).slice(0, 500);

export const normalizeEmail = (value: unknown): string => String(value ?? "").trim().toLowerCase();
