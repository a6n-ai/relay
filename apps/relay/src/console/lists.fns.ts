import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, orMissing, run } from "./guard";
import { READ, WRITE } from "./needs";
import { id, memberInput, validate } from "./schemas";
import { listInput, listPatch } from "../services/schemas";
import {
  addMember,
  createList,
  deleteList,
  importCsv,
  listLists,
  listMembers,
  removeMember,
  updateContact,
  updateList,
} from "../services/lists";
import { NAME_MAX } from "../shared/limits";

const VIEW = READ("list", "read");
const EDIT = WRITE("list", "write");
const IMPORT = WRITE("list", "import");

// Null means the role cannot see lists or their members: the page shows a denied state instead of an error.
// { missing: true } means the app or list does not exist or is not visible to this reader.
export const fetchLists = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(({ data }) => read(VIEW, orMissing((p) => listLists(env, p, data.appId))));

export const fetchListMembers = createServerFn({ method: "GET" })
  .validator(validate(z.object({ listId: id, cursor: z.string().max(254).optional() })))
  .handler(({ data }) => read(VIEW, orMissing((p) => listMembers(env, p, data.listId, data.cursor))));

export const createListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, list: listInput })))
  .handler(({ data }) => run(EDIT, (p) => createList(env, p, data.appId, data.list)));

export const updateListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: listPatch })))
  .handler(({ data }) => run(EDIT, (p) => updateList(env, p, data.id, data.patch)));

export const deleteListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => deleteList(env, p, data.id)));

export const addMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, member: memberInput })))
  .handler(({ data }) => run(EDIT, (p) => addMember(env, p, data.listId, data.member)));

export const importCsvFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, csv: z.string().max(2_000_000) })))
  .handler(({ data }) => run(IMPORT, (p) => importCsv(env, p, data)));

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, memberId: id })))
  .handler(({ data }) => run(EDIT, (p) => removeMember(env, p, data.listId, data.memberId)));

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, contactId: id, firstName: z.string().trim().max(NAME_MAX), lastName: z.string().trim().max(NAME_MAX) })))
  .handler(({ data }) => run(EDIT, (p) => updateContact(env, p, data)));
