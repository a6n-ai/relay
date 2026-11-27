import { campaignProblems, type CampaignProblem } from "../shared/campaign-problems";
import { IMPLIED_CONSENT_MS } from "../core/campaigns";
import { contactValues } from "../shared/merge";
import type { ResolvedSendInput } from "../shared/schemas";
import { newId } from "../shared/ids";
import type { SendResult } from "./types";
import { getTemplateRow, type RenderedTemplate } from "./templates";
import { ZodError } from "zod";
import { describeError } from "../core/log";
import { codeOf, RelayError, type ErrorCode } from "../shared/errors";
import { type TemplateView, type AutomationView } from "../shared/views";

export type AutomationInput = { name: string; listId: string; templateId: string; fromEmail: string; delayHours: number };
export type AutomationPatch = Partial<Omit<AutomationInput, "listId">>;


type AutomationDeps = {
  send: (input: ResolvedSendInput) => Promise<SendResult>;
  render: (appId: string, templateId: string, values: Record<string, string>) => RenderedTemplate | "missing" | "disabled";
  refreshLimits: () => Promise<unknown>;
  // Runs whose sender was refused once after a limits reload. In memory: a DO that restarts retries once more, never skips a run for good on a stale snapshot.
  senderRetried: Set<string>;
  unknownFailures: Map<string, number>;
  postalAddress: string | null;
};

const HOUR_MS = 3_600_000;
const RUN_BATCH = 100;
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
export function createAutomationRow(sql: SqlStorage, appId: string, input: AutomationInput): AutomationView {
  if (sql.exec("SELECT id FROM contact_list WHERE id = ? AND app_id = ?", input.listId, appId).toArray().length === 0) throw new RelayError("unknown list");
  const template = getTemplateRow(sql, input.templateId);
  if (!template || template.appId !== appId) throw new RelayError("unknown template");
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

export function updateAutomationRow(sql: SqlStorage, id: string, patch: AutomationPatch): AutomationView {
  const current = viewOf(sql, id);
  if (!current) throw new RelayError("not found");
  if (patch.templateId !== undefined) {
    const template = getTemplateRow(sql, patch.templateId);
    if (!template || template.appId !== current.appId) throw new RelayError("unknown template");
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

function readinessProblems(
  auto: { fromEmail: string; listId: string },
  template: TemplateView | null,
  postalAddress: string | null,
): CampaignProblem[] {
  return campaignProblems(
    {
      fromEmail: auto.fromEmail,
      subject: template?.subject ?? "",
      html: template?.html ?? "",
      text: template?.text ?? "",
      listIds: [auto.listId],
      audienceKind: "lists",
      hookReady: false,
    },
    postalAddress,
  );
}

// Turning on checks the same readiness as a campaign. Turning off is always allowed and skips the pending runs.
export function setAutomationEnabledRow(
  sql: SqlStorage,
  id: string,
  on: boolean,
  postalAddress: string | null,
): AutomationView | { problems: CampaignProblem[] } {
  const current = viewOf(sql, id);
  if (!current) throw new RelayError("not found");
  if (on) {
    const problems = readinessProblems(current, getTemplateRow(sql, current.templateId), postalAddress);
    if (problems.length > 0) return { problems };
  } else {
    sql.exec("UPDATE automation_run SET status = 'skipped', error = 'disabled' WHERE automation_id = ? AND status = 'pending'", id);
  }
  sql.exec("UPDATE automation SET enabled = ?, updated_at = ? WHERE id = ?", on ? 1 : 0, Date.now(), id);
  return viewOf(sql, id)!;
}

export function deleteAutomationRow(sql: SqlStorage, id: string): void {
  if (sql.exec("SELECT id FROM automation WHERE id = ?", id).toArray().length === 0) throw new RelayError("not found");
  sql.exec("DELETE FROM automation_run WHERE automation_id = ?", id);
  sql.exec("DELETE FROM automation WHERE id = ?", id);
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

// Render and send one automation message. Rendering is the template-send path (ClientDO.renderTemplate); the send path owns suppression, sender and quota checks.
async function sendTemplateForAutomation(
  deps: AutomationDeps,
  run: { automationId: string; appId: string; fromEmail: string; email: string; firstName: string | null; lastName: string | null },
  template: TemplateView,
): Promise<SendResult> {
  const values = contactValues({ email: run.email, firstName: run.firstName, lastName: run.lastName }, deps.postalAddress ?? "");
  const rendered = deps.render(run.appId, template.id, values);
  if (rendered === "missing") throw new RelayError("template_missing");
  if (rendered === "disabled") throw new RelayError("template_disabled");
  // Thrown before the send, so a blank subject skips one run instead of failing the whole pass.
  if (rendered.subject.trim() === "") throw new RelayError("empty_subject");
  return deps.send({
    appId: run.appId,
    stream: "marketing",
    from: run.fromEmail,
    to: run.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    event: "automation",
    idempotencyKey: `automation:${run.automationId}:${run.email}`,
  });
}

const UNKNOWN_FAILURE_LIMIT = 3;

type Due = { automationId: string; email: string; appId: string; listId: string; templateId: string; fromEmail: string };

// Refusals that clear once the workspace or queue recovers leave the run pending. A refusal about this one run's content or sender skips it
// with that code, and so does any other refusal code or a send input that fails validation. An error that is no refusal (an R2 failure, a bug)
// says nothing about this run, so it leaves the run pending for the next alarm.
function sendRefusal(err: unknown): { defer: true } | { skip: string } {
  const code: ErrorCode | undefined = codeOf(err);
  if (code === undefined) return err instanceof ZodError ? { skip: "invalid_input" } : { defer: true };
  switch (code) {
    case "workspace_suspended":
    case "quota_exceeded":
    case "limits unavailable":
    case "queue_failed":
      return { defer: true };
    case "sender_not_verified":
    case "empty_subject":
    case "template_missing":
    case "template_disabled":
      return { skip: code };
    default:
      return { skip: "invalid_input" };
  }
}

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
    // Checked before any send: a removed or lapsed contact is skipped, never mailed.
    const member = sql
      .exec<{ firstName: string | null; lastName: string | null; consentAt: number; consentSource: string }>(
        `SELECT m.first_name AS firstName, m.last_name AS lastName, m.consent_at AS consentAt, l.consent_source AS consentSource
         FROM contact_list_member m JOIN contact_list l ON l.id = m.list_id WHERE m.list_id = ? AND m.email = ?`,
        run.listId,
        run.email,
      )
      .toArray()[0];
    const reason = !member ? "left_list" : member.consentSource === "purchase" && member.consentAt < now - IMPLIED_CONSENT_MS ? "consent_lapsed" : null;
    if (!member || reason) {
      markRun(sql, run, "skipped", { error: reason ?? "left_list" });
      skipped += 1;
      continue;
    }
    const template = getTemplateRow(sql, run.templateId);
    if (!template) {
      markRun(sql, run, "skipped", { error: "template_missing" });
      skipped += 1;
      continue;
    }
    // Readiness can lapse after enable (for example, the unsubscribe link removed from the template).
    const [problem] = readinessProblems(run, template, deps.postalAddress);
    if (problem) {
      markRun(sql, run, "skipped", { error: problem });
      skipped += 1;
      continue;
    }
    let result: SendResult;
    try {
      result = await sendTemplateForAutomation(deps, { automationId: run.automationId, appId: run.appId, fromEmail: run.fromEmail, email: run.email, firstName: member.firstName, lastName: member.lastName }, template);
    } catch (err) {
      const code = codeOf(err);
      const retryKey = `${run.automationId}:${run.email}`;
      if (code === "sender_not_verified" && !deps.senderRetried.has(retryKey)) {
        // A sender verified after our snapshot would look unverified here. Reload once and retry on the next pass.
        await deps.refreshLimits();
        deps.senderRetried.add(retryKey);
        continue;
      }
      const refusal = sendRefusal(err);
      if ("defer" in refusal) {
        console.error("automation send deferred", describeError(err));
        if (code === undefined) {
          // An unexpected failure says nothing about the workspace: defer only this run, and skip it after UNKNOWN_FAILURE_LIMIT passes so it cannot block the rest.
          const failures = (deps.unknownFailures.get(retryKey) ?? 0) + 1;
          if (failures < UNKNOWN_FAILURE_LIMIT) {
            deps.unknownFailures.set(retryKey, failures);
            continue;
          }
          deps.unknownFailures.delete(retryKey);
          markRun(sql, run, "skipped", { error: "send_failed" });
          skipped += 1;
          continue;
        }
        // Quota, suspension and queue refusals leave the run pending. Stop so the rest wait for the retry.
        blocked = true;
        break;
      }
      deps.senderRetried.delete(retryKey);
      deps.unknownFailures.delete(retryKey);
      markRun(sql, run, "skipped", { error: refusal.skip });
      skipped += 1;
      continue;
    }
    deps.senderRetried.delete(`${run.automationId}:${run.email}`);
    deps.unknownFailures.delete(`${run.automationId}:${run.email}`);
    markRun(sql, run, "sent", { messageId: result.messageId, error: result.status === "suppressed" ? "suppressed" : undefined });
    sent += 1;
  }
  return { sent, skipped, more: due.length === RUN_BATCH && !blocked, blocked };
}
