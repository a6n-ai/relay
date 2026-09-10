// Generic CSV parsing/column-mapping lives in @foundry/commons so any
// @foundry-based app can reuse it, not just relay's contact-list import.
export { parseCsv, mapRows, normalizeAddress, looksLikeEmail } from "@foundry/commons";
export type { ParsedCsv, ContactMapping, ParsedContact, RejectedRow } from "@foundry/commons";
