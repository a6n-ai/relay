import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, READ, orMissing, run, WRITE } from "./guard";
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
import { fromActor } from "../services/principal";
import { NAME_MAX } from "../shared/limits";

const VIEW = READ("list", "read");
const EDIT = WRITE("list", "write");
const IMPORT = WRITE("list", "import");

// Null means the role cannot see lists or their members: the page shows a denied state instead of an error.
// { missing: true } means the app or list does not exist or is not visible to this reader.
export const fetchLists = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(({ data }) => read(VIEW, orMissing((actor) => listLists(env, fromActor(actor), data.appId))));

export const fetchListMembers = createServerFn({ method: "GET" })
  .validator(validate(z.object({ listId: id, cursor: z.string().max(254).optional() })))
  .handler(({ data }) => read(VIEW, orMissing((actor) => listMembers(env, fromActor(actor), data.listId, data.cursor))));

export const createListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, list: listInput })))
  .handler(({ data }) => run(EDIT, (actor) => createList(env, fromActor(actor), data.appId, data.list)));

export const updateListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: listPatch })))
  .handler(({ data }) => run(EDIT, (actor) => updateList(env, fromActor(actor), data.id, data.patch)));

export const deleteListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => deleteList(env, fromActor(actor), data.id)));

export const addMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, member: memberInput })))
  .handler(({ data }) => run(EDIT, (actor) => addMember(env, fromActor(actor), data.listId, data.member)));

export const importCsvFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, csv: z.string().max(2_000_000) })))
  .handler(({ data }) => run(IMPORT, (actor) => importCsv(env, fromActor(actor), data)));

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, memberId: id })))
  .handler(({ data }) => run(EDIT, (actor) => removeMember(env, fromActor(actor), data.listId, data.memberId)));

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, contactId: id, firstName: z.string().trim().max(NAME_MAX), lastName: z.string().trim().max(NAME_MAX) })))
  .handler(({ data }) => run(EDIT, (actor) => updateContact(env, fromActor(actor), data)));
