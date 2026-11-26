import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ConsoleError, requireActor, toResponseError } from "./actor";
import { id, listInput, listPatch, memberInput, validate } from "./schemas";
import {
  addMemberFor,
  createListFor,
  deleteListFor,
  importCsvFor,
  listListsFor,
  listMembersFor,
  removeMemberFor,
  updateContactFor,
  updateListFor,
} from "./lists";

const READ = { permission: { list: ["read"] } };
const WRITE = { permission: { list: ["write"] }, write: true };
const IMPORT = { permission: { list: ["import"] }, write: true };

// Null means the role cannot see lists or their members: the page shows a denied state instead of an error.
// { missing: true } means the app or list does not exist or is not visible to this reader.
export const fetchLists = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listListsFor(env, actor, data.appId);
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      if (err instanceof ConsoleError && err.status === 404) return { missing: true as const };
      toResponseError(err);
    }
  });

export const fetchListMembers = createServerFn({ method: "GET" })
  .validator(validate(z.object({ listId: id, cursor: z.string().max(254).optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listMembersFor(env, actor, data.listId, data.cursor);
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      if (err instanceof ConsoleError && err.status === 404) return { missing: true as const };
      toResponseError(err);
    }
  });

export const createListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, list: listInput })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await createListFor(env, actor, data.appId, data.list);
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: listPatch })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await updateListFor(env, actor, data.id, data.patch);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteListFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await deleteListFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const addMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, member: memberInput })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await addMemberFor(env, actor, data.listId, data.member);
    } catch (err) {
      toResponseError(err);
    }
  });

export const importCsvFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, csv: z.string().max(2_000_000) })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), IMPORT);
      return await importCsvFor(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, memberId: id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await removeMemberFor(env, actor, data.listId, data.memberId);
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ listId: id, contactId: id, firstName: z.string().trim().max(80), lastName: z.string().trim().max(80) })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await updateContactFor(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });
