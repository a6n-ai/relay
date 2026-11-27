import { writeAudit } from "../lib/auth/audit";
import type { KeyScope } from "./api-keys";
import { csvCell, membersCsvHeader } from "./csv";
import { memberInput } from "./member-input";
import { clientFor } from "./messages";
import type { ListInput, MemberInput } from "../do/lists";
import type { Env } from "../env";
import { z } from "zod";
import { RelayError } from "../shared/errors";
import { type ListView, type MemberView } from "../shared/views";

const audit = (env: Env, scope: KeyScope, action: string, target: string) =>
  writeAudit(env, { action, actorUserId: null, workspaceId: scope.workspaceId, target, data: { keyId: scope.keyId } });

// Every member route names its list first, so an id from another app is a 404 before any member is read.
export async function ownedList(env: Env, scope: KeyScope, listId: string): Promise<ListView> {
  const list = (await clientFor(env, scope.workspaceId).listLists(scope.workspaceId, scope.appId)).find((l) => l.id === listId);
  if (!list) throw new RelayError("not found");
  return list;
}

export const getListForScope = ownedList;

export function listListsForScope(env: Env, scope: KeyScope): Promise<ListView[]> {
  return clientFor(env, scope.workspaceId).listLists(scope.workspaceId, scope.appId);
}

export async function createListForScope(env: Env, scope: KeyScope, input: ListInput): Promise<ListView> {
  const list = await clientFor(env, scope.workspaceId).createList(scope.workspaceId, scope.appId, input);
  await audit(env, scope, "list.create", list.id);
  return list;
}

export async function updateListForScope(env: Env, scope: KeyScope, id: string, patch: Partial<ListInput>): Promise<ListView> {
  await ownedList(env, scope, id);
  const list = await clientFor(env, scope.workspaceId).updateList(scope.workspaceId, id, patch);
  if (!list) throw new RelayError("not found");
  await audit(env, scope, "list.update", id);
  return list;
}

export async function deleteListForScope(env: Env, scope: KeyScope, id: string): Promise<void> {
  await ownedList(env, scope, id);
  const outcome = await clientFor(env, scope.workspaceId).deleteList(scope.workspaceId, id);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "in_use") throw new RelayError("list in use");
  await audit(env, scope, "list.delete", id);
}

export async function listMembersForScope(
  env: Env,
  scope: KeyScope,
  listId: string,
  cursor?: string,
): Promise<{ rows: MemberView[]; nextCursor: string | null }> {
  await ownedList(env, scope, listId);
  const page = await clientFor(env, scope.workspaceId).listMembers(scope.workspaceId, listId, cursor);
  if (!page) throw new RelayError("not found");
  return page;
}

// Addresses never reach the audit row; the list id is the only target.
export async function addMemberForScope(env: Env, scope: KeyScope, listId: string, input: MemberInput) {
  await ownedList(env, scope, listId);
  const outcome = await clientFor(env, scope.workspaceId).addMember(scope.workspaceId, listId, input);
  if (outcome === "missing") throw new RelayError("not found");
  if (outcome === "suppressed") throw new RelayError("address suppressed");
  if (outcome === "added") await audit(env, scope, "list.member.add", listId);
  return outcome;
}

export async function removeMemberForScope(env: Env, scope: KeyScope, listId: string, memberId: string): Promise<void> {
  await ownedList(env, scope, listId);
  const removed = await clientFor(env, scope.workspaceId).removeMember(scope.workspaceId, listId, memberId);
  if (!removed) throw new RelayError("not found");
  await audit(env, scope, "list.member.remove", listId);
}

export const membersImportInput = z.object({ rows: z.array(memberInput).max(1000) });

export async function importMembersForScope(env: Env, scope: KeyScope, listId: string, rows: MemberInput[]) {
  if (rows.length > 1000) throw new RelayError("invalid input");
  await ownedList(env, scope, listId);
  const result = await clientFor(env, scope.workspaceId).importMembers(scope.workspaceId, listId, rows);
  if (!result) throw new RelayError("not found");
  await audit(env, scope, "list.import", listId);
  return result;
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

export async function exportMembersForScope(env: Env, scope: KeyScope, listId: string): Promise<Response> {
  await ownedList(env, scope, listId);
  return membersCsvResponse(
    env,
    scope.workspaceId,
    listId,
    () => audit(env, scope, "list.export", listId),
    () => new RelayError("not found"),
  );
}
