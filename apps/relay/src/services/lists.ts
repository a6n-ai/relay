import { z } from "zod";
import { csvCell, membersCsvHeader, parseContactsCsv } from "../core/csv";
import { decodeCursor } from "../core/cursor";
import { memberInput, type MemberInput } from "../core/member-input";
import { clientFor } from "../do/client";
import type { ImportResult, ListInput } from "../do/lists";
import type { Env } from "../env";
import { RelayError } from "../shared/errors";
import { type ListView, type MemberView } from "../shared/views";
import { appFor, audit, type Principal } from "./principal";

// A key reaches only the lists of its app, so an id from another app is a 404 before any member is read.
// A console principal has no app: the DO answers not found for a list outside the workspace.
async function checkList(env: Env, p: Principal, listId: string): Promise<void> {
  if (p.appId === null) return;
  const lists = await clientFor(env, p.workspaceId).listLists(p.workspaceId, p.appId);
  if (!lists.some((l) => l.id === listId)) throw new RelayError("not found");
}

export async function getList(env: Env, p: Principal, listId: string): Promise<ListView> {
  const appId = p.appId;
  if (appId === null) throw new RelayError("not found");
  const list = (await clientFor(env, p.workspaceId).listLists(p.workspaceId, appId)).find((l) => l.id === listId);
  if (!list) throw new RelayError("not found");
  return list;
}

export async function listLists(env: Env, p: Principal, appId: string): Promise<ListView[]> {
  await appFor(env, p, appId);
  return clientFor(env, p.workspaceId).listLists(p.workspaceId, appId);
}

export async function createList(env: Env, p: Principal, appId: string, input: ListInput): Promise<ListView> {
  await appFor(env, p, appId);
  const list = await clientFor(env, p.workspaceId).createList(p.workspaceId, appId, input);
  await audit(env, p, "list.create", list.id, { appId });
  return list;
}

export async function updateList(env: Env, p: Principal, id: string, patch: Partial<ListInput>): Promise<ListView> {
  await checkList(env, p, id);
  const list = await clientFor(env, p.workspaceId).updateList(p.workspaceId, id, patch);
  if (!list) throw new RelayError("not found");
  await audit(env, p, "list.update", id);
  return list;
}

export async function deleteList(env: Env, p: Principal, id: string): Promise<void> {
  await checkList(env, p, id);
  const outcome = await clientFor(env, p.workspaceId).deleteList(p.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "in_use") throw new RelayError("list in use");
  await audit(env, p, "list.delete", id);
}

export async function listMembers(
  env: Env,
  p: Principal,
  listId: string,
  cursor?: string,
): Promise<{ rows: MemberView[]; nextCursor: string | null }> {
  await checkList(env, p, listId);
  if (cursor !== undefined && !decodeCursor(cursor)) throw new RelayError("invalid cursor");
  const page = await clientFor(env, p.workspaceId).listMembers(p.workspaceId, listId, cursor);
  if (!page) throw new RelayError("not found");
  return { rows: page.rows, nextCursor: page.nextCursor };
}

// Addresses never reach the audit row; the list id is the only target.
export async function addMember(env: Env, p: Principal, listId: string, input: MemberInput) {
  await checkList(env, p, listId);
  const outcome = await clientFor(env, p.workspaceId).addMember(p.workspaceId, listId, input);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "suppressed") throw new RelayError("address suppressed");
  if (outcome === "added") await audit(env, p, "list.member.add", listId);
  return outcome;
}

export async function updateContact(
  env: Env,
  p: Principal,
  input: { listId: string; contactId: string; firstName: string; lastName: string },
): Promise<void> {
  await checkList(env, p, input.listId);
  const updated = await clientFor(env, p.workspaceId).updateMember(p.workspaceId, input.listId, input.contactId, input);
  if (!updated) throw new RelayError("not found");
  await audit(env, p, "list.member.update", input.contactId, { listId: input.listId });
}

export async function removeMember(env: Env, p: Principal, listId: string, memberId: string): Promise<void> {
  await checkList(env, p, listId);
  const removed = await clientFor(env, p.workspaceId).removeMember(p.workspaceId, listId, memberId);
  if (!removed) throw new RelayError("not found");
  await audit(env, p, "list.member.remove", memberId, { listId });
}

export const MEMBERS_IMPORT_MAX = 1000;
export const membersImportInput = z.object({ rows: z.array(memberInput).max(MEMBERS_IMPORT_MAX) });

async function importRows<E extends Record<string, number>>(env: Env, p: Principal, listId: string, rows: MemberInput[], extra = {} as E) {
  await checkList(env, p, listId);
  const result = await clientFor(env, p.workspaceId).importMembers(p.workspaceId, listId, rows);
  if (!result) throw new RelayError("not found");
  const counts = { ...result, ...extra };
  await audit(env, p, "list.import", listId, counts);
  return counts;
}

export function importMembers(env: Env, p: Principal, listId: string, rows: MemberInput[]) {
  if (rows.length > MEMBERS_IMPORT_MAX) throw new RelayError("invalid input");
  return importRows(env, p, listId, rows);
}

// Parser errors carry fixed messages, so they go out as 400 as they are.
export async function importCsv(
  env: Env,
  p: Principal,
  input: { listId: string; csv: string },
): Promise<ImportResult & { invalid: number; duplicates: number }> {
  let parsed: ReturnType<typeof parseContactsCsv>;
  try {
    parsed = parseContactsCsv(input.csv);
  } catch (err) {
    throw new RelayError("invalid input", 400, err instanceof Error ? err.message : "invalid csv");
  }
  return importRows(env, p, input.listId, parsed.rows, { invalid: parsed.invalid, duplicates: parsed.duplicates });
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
// onOpen runs once, when the download starts, and is where the caller writes its audit row.
export async function membersCsvResponse(
  env: Env,
  workspaceId: string,
  listId: string,
  onOpen: () => Promise<void>,
  missing: () => Error,
): Promise<Response> {
  const client = clientFor(env, workspaceId);
  let pending: { rows: MemberView[]; next: string | null } | null = await client.exportMembers(workspaceId, listId, null);
  if (!pending) throw missing();
  const encoder = new TextEncoder();
  let headerSent = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        headerSent = true;
        await onOpen();
        controller.enqueue(encoder.encode(`${membersCsvHeader}\n`));
        return;
      }
      if (pending === null) {
        controller.close();
        return;
      }
      const page: { rows: MemberView[]; next: string | null } = pending;
      // Always enqueue, even an empty page, so the stream keeps pulling.
      controller.enqueue(encoder.encode(page.rows.map(memberCsvLine).join("")));
      if (page.next === null) {
        pending = null;
        return;
      }
      let following: { rows: MemberView[]; next: string | null } | null;
      try {
        following = await client.exportMembers(workspaceId, listId, page.next);
      } catch (err) {
        // Errors the runtime would swallow must still fail the download, not end it as a short file.
        controller.error(err);
        return;
      }
      if (!following) {
        controller.error(missing());
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

// The first page is read before the stream starts, so a missing list is a 404 and not an empty file.
export async function exportMembers(env: Env, p: Principal, listId: string): Promise<Response> {
  await checkList(env, p, listId);
  return membersCsvResponse(
    env,
    p.workspaceId,
    listId,
    () => audit(env, p, "list.export", listId),
    () => new RelayError("not found"),
  );
}
