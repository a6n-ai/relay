import { DAY_MS } from "../shared/limits";
import type { SuppressionReason } from "../shared/mail";
import type { BlockQuery, BlockSummary, BlockView } from "../shared/views";

// A brand opt-out lists as a marketing unsubscribe unless the address already has an unsubscribe block.
// MIN(created_at) makes SQLite take the other columns from that earliest row.
const BLOCKS = `WITH blocks AS (
  SELECT email, reason, stream, source, campaign_ref, campaign_name, created_at FROM suppression
  UNION ALL
  SELECT email, 'unsubscribe', 'marketing', source, campaign_ref, campaign_name, MIN(created_at)
  FROM marketing_optout o
  WHERE NOT EXISTS (SELECT 1 FROM suppression s WHERE s.email = o.email AND s.reason = 'unsubscribe')
  GROUP BY email
)`;

const SORT_COLUMNS = { time: "created_at", address: "email", stream: "stream", reason: "reason" } as const;
const DIRECTIONS = { asc: "ASC", desc: "DESC" } as const;

type Query = BlockQuery & Required<Pick<BlockQuery, "sort" | "dir" | "offset" | "limit">>;

export function listBlockRows(sql: SqlStorage, q: Query): { rows: BlockView[]; total: number } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const add = (clause: string, ...values: (string | number)[]) => {
    where.push(clause);
    params.push(...values);
  };
  const within = (column: string) => `${column} IN (SELECT value FROM json_each(?))`;
  // An empty array is no filter.
  if (q.reasons?.length) add(within("reason"), JSON.stringify(q.reasons));
  if (q.sources?.length) add(within("source"), JSON.stringify(q.sources));
  // "all" is the stored NULL: a block on every stream.
  if (q.streams?.length) add(`(${within("stream")}${q.streams.includes("all") ? " OR stream IS NULL" : ""})`, JSON.stringify(q.streams));
  if (q.from !== undefined) add("created_at >= ?", q.from);
  if (q.to !== undefined) add("created_at <= ?", q.to);
  // instr, not LIKE: "_" is common in addresses.
  const search = q.search?.trim().toLowerCase();
  if (search) add("instr(email, ?) > 0", search);
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = sql
    .exec<BlockView>(
      `${BLOCKS} SELECT email, reason, stream, source, campaign_ref AS campaignRef, campaign_name AS campaignName, created_at AS createdAt
       FROM blocks ${filter} ORDER BY ${SORT_COLUMNS[q.sort]} ${DIRECTIONS[q.dir]}, email, reason LIMIT ? OFFSET ?`,
      ...params,
      q.limit,
      q.offset,
    )
    .toArray();
  const { total } = sql.exec<{ total: number }>(`${BLOCKS} SELECT count(*) AS total FROM blocks ${filter}`, ...params).one();
  return { rows, total };
}

export function blockSummaryRows(sql: SqlStorage, now: number): BlockSummary {
  const today = new Date(now);
  const rows = sql
    .exec<{ reason: SuppressionReason; total: number; last30: number; thisMonth: number }>(
      `${BLOCKS} SELECT reason, count(*) AS total, sum(created_at >= ?) AS last30, sum(created_at >= ?) AS thisMonth FROM blocks GROUP BY reason`,
      now - 30 * DAY_MS,
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    )
    .toArray();
  const zero = () => ({ unsubscribe: 0, bounce: 0, complaint: 0, manual: 0 });
  const summary: BlockSummary = { total: zero(), last30: zero(), thisMonth: zero() };
  for (const row of rows) for (const period of ["total", "last30", "thisMonth"] as const) summary[period][row.reason] = row[period];
  return summary;
}
