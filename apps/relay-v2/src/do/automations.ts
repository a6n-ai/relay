import { campaignProblems, type CampaignProblem } from "../core/campaign-problems";
import { IMPLIED_CONSENT_MS } from "../core/campaigns";
import { contactValues, renderMerge } from "../core/merge";
import type { SendInput } from "../core/send-input";
import { newId } from "../lib/ids";
import type { SendResult } from "./client-do";
import { getTemplateRow, type TemplateView } from "./templates";

export type AutomationInput = { name: string; listId: string; templateId: string; fromEmail: string; delayHours: number };
export type AutomationPatch = Partial<Omit<AutomationInput, "listId">>;

export type AutomationView = {
  id: string;
  appId: string;
  name: string;
  listId: string;
  templateId: string;
  fromEmail: string;
  delayHours: number;
  enabled: boolean;
  pending: number;
  sent: number;
  skipped: number;
  createdAt: number;
  updatedAt: number;
};

export type AutomationDeps = {
  send: (input: SendInput) => Promise<SendResult>;
  postalAddress: string | null;
};

const HOUR_MS = 3_600_000;
export const RUN_BATCH = 100;
// Used when a send is refused for quota or suspension: the runs stay pending and are retried on this cadence.
const RETRY_MS = 600_000;

type Row = Omit<AutomationView, "enabled" | "pending" | "sent" | "skipped"> & { enabled: number };

function views(sql: SqlStorage, where: string, bindings: unknown[]): AutomationView[] {
  const rows = sql
    .exec<Row>(
      `SELECT a.id, a.app_id AS appId, a.name, a.list_id AS listId, a.template_id AS templateId, a.from_email AS fromEmail,
              a.delay_hours AS delayHours, a.enabled, a.created_at AS createdAt, a.updated_at AS updatedAt
       FROM automation a ${where} ORDER BY a.created_at DESC, a.id DESC`,
      ...bindings,
    )
    .toArray();
  if (rows.length === 0) return [];
  const counts = new Map<string, Record<string, number>>();
  for (const c of sql
    .exec<{ automationId: string; status: string; n: number }>(
      `SELECT automation_id AS automationId, status, COUNT(*) AS n FROM automation_run
       WHERE automation_id IN (SELECT a.id FROM automation a ${where}) GROUP BY automation_id, status`,
      ...bindings,
    )
    .toArray()) {
    const tally = counts.get(c.automationId) ?? {};
    tally[c.status] = c.n;
    counts.set(c.automationId, tally);
  }
  return rows.map(({ enabled, ...r }) => {
    const tally = counts.get(r.id) ?? {};
    return { ...r, enabled: enabled === 1, pending: tally.pending ?? 0, sent: tally.sent ?? 0, skipped: tally.skipped ?? 0 };
  });
}

function viewOf(sql: SqlStorage, id: string): AutomationView | null {
  return views(sql, "WHERE a.id = ?", [id])[0] ?? null;
}

export function listAutomationRows(sql: SqlStorage, appId?: string): AutomationView[] {
  return appId === undefined ? views(sql, "", []) : views(sql, "WHERE a.app_id = ?", [appId]);
}

// A template of another app is treated as missing, so an id from app B never reaches app A's automation.
export function createAutomationRow(sql: SqlStorage, appId: string, input: AutomationInput): AutomationView | "bad_list" | "bad_template" {
  if (sql.exec("SELECT id FROM contact_list WHERE id = ? AND app_id = ?", input.listId, appId).toArray().length === 0) return "bad_list";
  const template = getTemplateRow(sql, input.templateId);
  if (!template || template.appId !== appId) return "bad_template";
  const id = newId("aut");
  const now = Date.now();
  sql.exec(
    "INSERT INTO automation (id, app_id, name, list_id, template_id, from_email, delay_hours, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
    id,
    appId,
    input.name,
    input.listId,
    input.templateId,
    input.fromEmail,
    input.delayHours,
    now,
    now,
  );
  return viewOf(sql, id)!;
}

export function updateAutomationRow(sql: SqlStorage, id: string, patch: AutomationPatch): AutomationView | "missing" | "bad_template" {
  const current = viewOf(sql, id);
  if (!current) return "missing";
  if (patch.templateId !== undefined) {
    const template = getTemplateRow(sql, patch.templateId);
    if (!template || template.appId !== current.appId) return "bad_template";
  }
  sql.exec(
    "UPDATE automation SET name = ?, template_id = ?, from_email = ?, delay_hours = ?, updated_at = ? WHERE id = ?",
    patch.name ?? current.name,
    patch.templateId ?? current.templateId,
    patch.fromEmail ?? current.fromEmail,
    patch.delayHours ?? current.delayHours,
    Date.now(),
    id,
  );
  return viewOf(sql, id)!;
}

// Turning on checks the same readiness as a campaign. Turning off is always allowed.
export function setAutomationEnabledRow(
  sql: SqlStorage,
  id: string,
  on: boolean,
  postalAddress: string | null,
): AutomationView | "missing" | { problems: CampaignProblem[] } {
  const current = viewOf(sql, id);
  if (!current) return "missing";
  if (on) {
    const template = getTemplateRow(sql, current.templateId);
    const problems = campaignProblems(
      {
        fromEmail: current.fromEmail,
        subject: template?.subject ?? "",
        html: template?.html ?? "",
        text: template?.text ?? "",
        listIds: [current.listId],
        audienceKind: "lists",
        hookReady: false,
      },
      postalAddress,
    );
    if (problems.length > 0) return { problems };
  }
  sql.exec("UPDATE automation SET enabled = ?, updated_at = ? WHERE id = ?", on ? 1 : 0, Date.now(), id);
  return viewOf(sql, id)!;
}

export function deleteAutomationRow(sql: SqlStorage, id: string): "deleted" | "missing" {
  if (sql.exec("SELECT id FROM automation WHERE id = ?", id).toArray().length === 0) return "missing";
  sql.exec("DELETE FROM automation_run WHERE automation_id = ?", id);
  sql.exec("DELETE FROM automation WHERE id = ?", id);
  return "deleted";
}

// Called inside the add-member transaction. Only enabled automations enrol, and a repeat add keeps its first run.
export function enrolAutomations(sql: SqlStorage, listId: string, email: string, now: number): void {
  sql.exec(
    `INSERT OR IGNORE INTO automation_run (automation_id, email, due_at, status, created_at)
     SELECT id, ?, ? + delay_hours * ${HOUR_MS}, 'pending', ? FROM automation WHERE list_id = ? AND enabled = 1`,
    email,
    now,
    now,
    listId,
  );
}

// Only runs of enabled automations count, so a disabled automation's old runs never keep the alarm awake.
export function earliestDue(sql: SqlStorage): number | null {
  return (
    sql
      .exec<{ due: number | null }>(
        "SELECT MIN(r.due_at) AS due FROM automation_run r JOIN automation a ON a.id = r.automation_id WHERE r.status = 'pending' AND a.enabled = 1",
      )
      .one().due ?? null
  );
}

export function nextAutomationAlarm(sql: SqlStorage, now: number, outcome: { more: boolean; blocked: boolean }): number | null {
  const due = earliestDue(sql);
  if (due === null) return null;
  if (outcome.more) return now + 1;
  if (due > now) return due;
  return now + (outcome.blocked ? RETRY_MS : 1);
}

// Render and send one automation message. The send path owns suppression, sender and quota checks.
export async function sendTemplateForAutomation(
  deps: AutomationDeps,
  run: { automationId: string; appId: string; fromEmail: string; email: string; firstName: string | null; lastName: string | null },
  template: TemplateView,
): Promise<SendResult> {
  const values = contactValues({ email: run.email, firstName: run.firstName, lastName: run.lastName }, deps.postalAddress ?? "");
  const subject = renderMerge(template.subject, values, "subject");
  // Thrown before the send, so a blank subject skips one run instead of failing the whole pass.
  if (subject.trim() === "") throw new Error("empty_subject");
  return deps.send({
    appId: run.appId,
    stream: "marketing",
    from: run.fromEmail,
    to: run.email,
    subject,
    html: renderMerge(template.html, values, "html"),
    text: renderMerge(template.text, values, "text"),
    event: "automation",
    idempotencyKey: `automation:${run.automationId}:${run.email}`,
  });
}

type Due = { automationId: string; email: string; appId: string; listId: string; templateId: string; fromEmail: string };

function markRun(sql: SqlStorage, run: Due, status: "sent" | "skipped", detail: { messageId?: string; error?: string }): void {
  sql.exec(
    "UPDATE automation_run SET status = ?, message_id = ?, error = ? WHERE automation_id = ? AND email = ?",
    status,
    detail.messageId ?? null,
    detail.error ?? null,
    run.automationId,
    run.email,
  );
}

// Checked before any send: a removed or lapsed contact is skipped, never mailed.
function skipReason(sql: SqlStorage, run: Due, now: number): string | null {
  const member = sql
    .exec<{ firstName: string | null; lastName: string | null; consentAt: number; consentSource: string }>(
      `SELECT m.first_name AS firstName, m.last_name AS lastName, m.consent_at AS consentAt, l.consent_source AS consentSource
       FROM contact_list_member m JOIN contact_list l ON l.id = m.list_id WHERE m.list_id = ? AND m.email = ?`,
      run.listId,
      run.email,
    )
    .toArray()[0];
  if (!member) return "left_list";
  if (member.consentSource === "purchase" && member.consentAt < now - IMPLIED_CONSENT_MS) return "consent_lapsed";
  return null;
}

export async function runDueAutomationRows(
  sql: SqlStorage,
  deps: AutomationDeps,
  now: number,
): Promise<{ sent: number; skipped: number; more: boolean; blocked: boolean }> {
  const due = sql
    .exec<Due>(
      `SELECT r.automation_id AS automationId, r.email, a.app_id AS appId, a.list_id AS listId, a.template_id AS templateId, a.from_email AS fromEmail
       FROM automation_run r JOIN automation a ON a.id = r.automation_id
       WHERE r.status = 'pending' AND a.enabled = 1 AND r.due_at <= ?
       ORDER BY r.due_at, r.automation_id, r.email LIMIT ?`,
      now,
      RUN_BATCH,
    )
    .toArray();
  let sent = 0;
  let skipped = 0;
  let blocked = false;
  for (const run of due) {
    const reason = skipReason(sql, run, now);
    if (reason) {
      markRun(sql, run, "skipped", { error: reason });
      skipped += 1;
      continue;
    }
    const template = getTemplateRow(sql, run.templateId);
    if (!template) {
      markRun(sql, run, "skipped", { error: "template_missing" });
      skipped += 1;
      continue;
    }
    const member = sql
      .exec<{ firstName: string | null; lastName: string | null }>(
        "SELECT first_name AS firstName, last_name AS lastName FROM contact_list_member WHERE list_id = ? AND email = ?",
        run.listId,
        run.email,
      )
      .one();
    let result: SendResult;
    try {
      result = await sendTemplateForAutomation(deps, { automationId: run.automationId, appId: run.appId, fromEmail: run.fromEmail, email: run.email, ...member }, template);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      if (message === "sender_not_verified" || message === "empty_subject") {
        markRun(sql, run, "skipped", { error: message });
        skipped += 1;
        continue;
      }
      // Quota, suspension and transient failures leave the run pending. Stop so the rest wait for the retry.
      blocked = true;
      console.error("automation send deferred", message);
      break;
    }
    markRun(sql, run, "sent", { messageId: result.messageId, error: result.status === "suppressed" ? "suppressed" : undefined });
    sent += 1;
  }
  return { sent, skipped, more: due.length === RUN_BATCH && !blocked, blocked };
}
