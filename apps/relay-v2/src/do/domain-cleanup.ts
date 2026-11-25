// Per-workspace DO work for deleting a sending domain. Domains are validated hostnames, so LIKE needs no escaping.
// Mail history for a domain: what it sent, plus what arrived at its inboxes.
const HISTORY = "(from_email LIKE ? OR (direction = 'in' AND to_email LIKE ?))";
export const HISTORY_BATCH = 100;

export function domainUsage(sql: SqlStorage, domain: string): { messages: number; campaigns: number; automations: number } {
  const like = `%@${domain}`;
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
  const like = `%@${domain}`;
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
  sql.exec("UPDATE automation SET enabled = 0, from_email = '', updated_at = ? WHERE from_email LIKE ?", now, like);
  return { campaigns, automations };
}

// One batch of history rows with their R2 keys. Callers loop until it comes back empty.
export function historyBatch(sql: SqlStorage, domain: string): { id: string; keys: string[] }[] {
  const like = `%@${domain}`;
  const rows = sql
    .exec<{ id: string; htmlKey: string | null; rawKey: string | null }>(
      `SELECT id, html_key AS htmlKey, raw_key AS rawKey FROM message WHERE ${HISTORY} LIMIT ${HISTORY_BATCH}`,
      like,
      like,
    )
    .toArray();
  if (rows.length === 0) return [];
  const marks = rows.map(() => "?").join(", ");
  const attachments = sql
    .exec<{ messageId: string; r2Key: string }>(`SELECT message_id AS messageId, r2_key AS r2Key FROM attachment WHERE message_id IN (${marks})`, ...rows.map((r) => r.id))
    .toArray();
  return rows.map((r) => ({
    id: r.id,
    keys: [r.htmlKey, r.rawKey, ...attachments.filter((a) => a.messageId === r.id).map((a) => a.r2Key)].filter((k): k is string => !!k),
  }));
}

// Call inside transactionSync with at most HISTORY_BATCH ids, so one statement stays under the 100-parameter limit.
export function deleteHistoryRows(sql: SqlStorage, ids: string[]): void {
  const marks = ids.map(() => "?").join(", ");
  sql.exec(`DELETE FROM attachment WHERE message_id IN (${marks})`, ...ids);
  sql.exec(`DELETE FROM message_event WHERE message_id IN (${marks})`, ...ids);
  sql.exec(`DELETE FROM message WHERE id IN (${marks})`, ...ids);
}
