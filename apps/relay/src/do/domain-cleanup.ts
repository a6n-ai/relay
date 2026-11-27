import { domainLikePattern } from "../core/sending-domain";
// Per-workspace DO work for deleting a sending domain. Domains are validated hostnames, so LIKE needs no escaping.
// Mail history for a domain: what it sent, plus what arrived at its own addresses. Inbound mail merely sent FROM the domain
// to someone else's address is not the domain's history.
const HISTORY = "((direction = 'out' AND from_email LIKE ?) OR (direction = 'in' AND to_email LIKE ?))";
export const HISTORY_BATCH = 100;

export function domainUsage(sql: SqlStorage, domain: string): { messages: number; campaigns: number; automations: number } {
  const like = domainLikePattern(domain);
  const n = (query: string, ...params: string[]) => sql.exec<{ n: number }>(query, ...params).one().n;
  return {
    messages: n(`SELECT COUNT(*) AS n FROM message WHERE ${HISTORY}`, like, like),
    campaigns: n("SELECT COUNT(*) AS n FROM campaign WHERE from_email LIKE ?", like),
    automations: n("SELECT COUNT(*) AS n FROM automation WHERE from_email LIKE ?", like),
  };
}

// Call inside transactionSync. Live campaigns lose their From and pause (a draft just loses it); automations go off with an empty From.
// An empty From is what campaignProblems reads as from_missing, so the console shows why nothing sends.
export function detachDomainSenders(sql: SqlStorage, domain: string, now: number): { campaigns: string[]; automations: string[] } {
  const like = domainLikePattern(domain);
  const campaigns = sql
    .exec<{ id: string }>("SELECT id FROM campaign WHERE from_email LIKE ? AND status IN ('draft', 'scheduled', 'sending', 'paused')", like)
    .toArray()
    .map((r) => r.id);
  sql.exec(
    "UPDATE campaign SET from_email = NULL, status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'paused' END, updated_at = ? WHERE from_email LIKE ? AND status IN ('draft', 'scheduled', 'sending', 'paused')",
    now,
    like,
  );
  const automations = sql.exec<{ id: string }>("SELECT id FROM automation WHERE from_email LIKE ?", like).toArray().map((r) => r.id);
  // Same as a normal disable: pending runs are skipped, so re-enabling later does not send the overdue backlog at once.
  sql.exec("UPDATE automation_run SET status = 'skipped', error = 'disabled' WHERE status = 'pending' AND automation_id IN (SELECT id FROM automation WHERE from_email LIKE ?)", like);
  sql.exec("UPDATE automation SET enabled = 0, from_email = '', updated_at = ? WHERE from_email LIKE ?", now, like);
  return { campaigns, automations };
}

// One batch of history rows with the R2 keys that go with them. Callers loop until it comes back empty.
// rawKeys are kept apart because an inbound_failure row may still need the same raw letter.
export function historyBatch(sql: SqlStorage, domain: string): { ids: string[]; keys: string[]; rawKeys: string[] } {
  const like = domainLikePattern(domain);
  const rows = sql
    .exec<{ id: string; htmlKey: string | null; rawKey: string | null }>(
      `SELECT id, html_key AS htmlKey, raw_key AS rawKey FROM message WHERE ${HISTORY} LIMIT ${HISTORY_BATCH}`,
      like,
      like,
    )
    .toArray();
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return { ids, keys: [], rawKeys: [] };
  const marks = ids.map(() => "?").join(", ");
  const attachmentKeys = sql.exec<{ k: string }>(`SELECT r2_key AS k FROM attachment WHERE message_id IN (${marks})`, ...ids).toArray();
  const payloadKeys = sql.exec<{ k: string }>(`SELECT payload_key AS k FROM webhook_delivery WHERE message_id IN (${marks})`, ...ids).toArray();
  return {
    ids,
    keys: [...rows.map((r) => r.htmlKey), ...attachmentKeys.map((a) => a.k), ...payloadKeys.map((p) => p.k)].filter((k): k is string => !!k),
    rawKeys: rows.map((r) => r.rawKey).filter((k): k is string => !!k),
  };
}

// Call inside transactionSync with at most HISTORY_BATCH ids, so one statement stays under the 100-parameter limit.
export function deleteHistoryRows(sql: SqlStorage, ids: string[]): void {
  const marks = ids.map(() => "?").join(", ");
  sql.exec(`DELETE FROM attachment WHERE message_id IN (${marks})`, ...ids);
  sql.exec(`DELETE FROM message_event WHERE message_id IN (${marks})`, ...ids);
  sql.exec(`DELETE FROM webhook_delivery WHERE message_id IN (${marks})`, ...ids);
  sql.exec(`DELETE FROM message WHERE id IN (${marks})`, ...ids);
}

// Failed inbound letters addressed to the domain: the row and its raw letter go with the history.
export function failureBatch(sql: SqlStorage, domain: string): { ids: string[]; rawKeys: string[] } {
  const rows = sql
    .exec<{ id: string; rawKey: string }>(`SELECT id, raw_key AS rawKey FROM inbound_failure WHERE envelope_to LIKE ? LIMIT ${HISTORY_BATCH}`, `%@${domain}`)
    .toArray();
  return { ids: rows.map((r) => r.id), rawKeys: rows.map((r) => r.rawKey) };
}

export function deleteFailureRows(sql: SqlStorage, ids: string[]): void {
  sql.exec(`DELETE FROM inbound_failure WHERE id IN (${ids.map(() => "?").join(", ")})`, ...ids);
}

export const rawKeyInUse = (sql: SqlStorage, key: string): boolean =>
  sql.exec("SELECT 1 FROM message WHERE raw_key = ? UNION ALL SELECT 1 FROM inbound_failure WHERE raw_key = ? LIMIT 1", key, key).toArray().length > 0;
