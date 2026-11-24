import { csvCell, membersCsvHeader, parseContactsCsv } from "../core/csv";
import { clientFor } from "../core/messages";
import type { ImportResult, ListInput, ListView, MemberInput, MemberView } from "../do/lists";
import { decodeCursor } from "../do/console-reads";
import type { Env } from "../env";
import { writeAudit } from "../lib/auth/audit";
import { allows } from "../lib/auth/permissions";
import { ConsoleError, type ConsoleActor } from "./actor";
import { getApp } from "./apps";

const READ = { list: ["read"] };
const WRITE = { list: ["write"] };
const IMPORT = { list: ["import"] };

function requireRead(actor: ConsoleActor): void {
  if (!allows(actor.roles, READ)) throw new ConsoleError(403, "forbidden");
}

function requireWrite(actor: ConsoleActor): void {
  if (!allows(actor.roles, WRITE)) throw new ConsoleError(403, "forbidden");
  if (actor.workspaceStatus === "suspended") throw new ConsoleError(403, "workspace suspended");
}

function requireImport(actor: ConsoleActor): void {
  if (!allows(actor.roles, IMPORT)) throw new ConsoleError(403, "forbidden");
  if (actor.workspaceStatus === "suspended") throw new ConsoleError(403, "workspace suspended");
}

export async function listListsFor(env: Env, actor: ConsoleActor, appId: string): Promise<ListView[]> {
  requireRead(actor);
  await getApp(env, actor, appId);
  return clientFor(env, actor.workspaceId).listLists(actor.workspaceId, appId);
}

export async function createListFor(env: Env, actor: ConsoleActor, appId: string, input: ListInput): Promise<ListView> {
  requireWrite(actor);
  await getApp(env, actor, appId);
  const list = await clientFor(env, actor.workspaceId).createList(actor.workspaceId, appId, input);
  await writeAudit(env, {
    action: "list.create",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: list.id,
    data: { appId },
  });
  return list;
}

export async function updateListFor(env: Env, actor: ConsoleActor, id: string, patch: Partial<ListInput>): Promise<ListView> {
  requireWrite(actor);
  const list = await clientFor(env, actor.workspaceId).updateList(actor.workspaceId, id, patch);
  if (!list) throw new ConsoleError(404, "not found");
  await writeAudit(env, { action: "list.update", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
  return list;
}

export async function deleteListFor(env: Env, actor: ConsoleActor, id: string): Promise<void> {
  requireWrite(actor);
  const outcome = await clientFor(env, actor.workspaceId).deleteList(actor.workspaceId, id);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  if (outcome === "in_use") throw new ConsoleError(409, "list in use");
  await writeAudit(env, { action: "list.delete", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: id });
}

export async function listMembersFor(
  env: Env,
  actor: ConsoleActor,
  listId: string,
  cursor?: string,
): Promise<{ rows: MemberView[]; nextCursor: string | null }> {
  requireRead(actor);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new ConsoleError(400, "invalid cursor");
  const page = await clientFor(env, actor.workspaceId).listMembers(actor.workspaceId, listId, cursor);
  if (!page) throw new ConsoleError(404, "not found");
  return { rows: page.rows, nextCursor: page.nextCursor };
}

// Addresses never reach the audit row; the list id is the only target.
export async function addMemberFor(env: Env, actor: ConsoleActor, listId: string, input: MemberInput) {
  requireWrite(actor);
  const outcome = await clientFor(env, actor.workspaceId).addMember(actor.workspaceId, listId, input);
  if (outcome === "missing") throw new ConsoleError(404, "not found");
  if (outcome === "suppressed") throw new ConsoleError(409, "address suppressed");
  if (outcome === "added") {
    await writeAudit(env, { action: "list.member.add", actorUserId: actor.userId, workspaceId: actor.workspaceId, target: listId });
  }
  return outcome;
}

export async function removeMemberFor(env: Env, actor: ConsoleActor, listId: string, memberId: string): Promise<void> {
  requireWrite(actor);
  const removed = await clientFor(env, actor.workspaceId).removeMember(actor.workspaceId, listId, memberId);
  if (!removed) throw new ConsoleError(404, "not found");
  await writeAudit(env, {
    action: "list.member.remove",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: memberId,
    data: { listId },
  });
}

// Parser errors carry fixed messages, so they go out as 400 as they are.
export async function importCsvFor(
  env: Env,
  actor: ConsoleActor,
  input: { listId: string; csv: string },
): Promise<ImportResult & { invalid: number; duplicates: number }> {
  requireImport(actor);
  let parsed: ReturnType<typeof parseContactsCsv>;
  try {
    parsed = parseContactsCsv(input.csv);
  } catch (err) {
    throw new ConsoleError(400, err instanceof Error ? err.message : "invalid csv");
  }
  const result = await clientFor(env, actor.workspaceId).importMembers(actor.workspaceId, input.listId, parsed.rows);
  if (!result) throw new ConsoleError(404, "not found");
  const counts = { ...result, invalid: parsed.invalid, duplicates: parsed.duplicates };
  await writeAudit(env, {
    action: "list.import",
    actorUserId: actor.userId,
    workspaceId: actor.workspaceId,
    target: input.listId,
    data: counts,
  });
  return counts;
}

const memberCsvLine = (m: MemberView): string =>
  [
    m.email,
    m.firstName ?? "",
    m.lastName ?? "",
    m.source,
    new Date(m.consentAt).toISOString(),
    new Date(m.createdAt).toISOString(),
    m.state,
    m.optedOut.join(";"),
  ]
    .map(csvCell)
    .join(",") + "\n";

// The first page is read before the stream starts, so a missing list is a 404 and not an empty file.
export async function exportMembersFor(env: Env, actor: ConsoleActor, listId: string): Promise<Response> {
  requireImport(actor);
  const client = clientFor(env, actor.workspaceId);
  let pending: { rows: MemberView[]; next: string | null } | null = await client.exportMembers(actor.workspaceId, listId, null);
  if (!pending) throw new ConsoleError(404, "not found");
  const encoder = new TextEncoder();
  let headerSent = false;
  let rowsOut = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        headerSent = true;
        controller.enqueue(encoder.encode(`${membersCsvHeader}\n`));
        return;
      }
      if (pending === null) {
        await writeAudit(env, {
          action: "list.export",
          actorUserId: actor.userId,
          workspaceId: actor.workspaceId,
          target: listId,
          data: { rows: rowsOut },
        });
        controller.close();
        return;
      }
      const page: { rows: MemberView[]; next: string | null } = pending;
      rowsOut += page.rows.length;
      // Always enqueue, even an empty page, so the stream keeps pulling.
      controller.enqueue(encoder.encode(page.rows.map(memberCsvLine).join("")));
      if (page.next === null) {
        pending = null;
        return;
      }
      const following = await client.exportMembers(actor.workspaceId, listId, page.next);
      if (!following) {
        controller.error(new ConsoleError(404, "not found"));
        return;
      }
      pending = following;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${listId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
