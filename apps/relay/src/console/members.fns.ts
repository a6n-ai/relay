import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ConsoleError, requireActor, toResponseError } from "./actor";
import {
  acceptInvite,
  cancelInvite,
  changeRole,
  createTeam,
  deleteTeam,
  getInvite,
  inviteMember,
  listPeople,
  removeMember,
  renameTeam,
  setTeamMember,
} from "./members";
import { id, inviteInput, name, role, validate } from "./schemas";

const READ = {};
const perm = (need: Record<string, string[]>) => ({ permission: need, write: true });

// Null means no workspace or a suspended one: the page shows a denied state with a 200, not an error status.
export const fetchPeople = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), READ);
    return await listPeople(env, actor);
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 403) return null;
    toResponseError(err);
  }
});

export const inviteMemberFn = createServerFn({ method: "POST" })
  .validator(validate(inviteInput))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ invitation: ["create"] }));
      return await inviteMember(env, actor, headers, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const cancelInviteFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ invitation: ["cancel"] }));
      await cancelInvite(env, actor, headers, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const changeRoleFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ memberId: id, role })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ member: ["update"] }));
      await changeRole(env, actor, headers, data.memberId, data.role);
    } catch (err) {
      toResponseError(err);
    }
  });

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ memberId: id })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ member: ["delete"] }));
      await removeMember(env, actor, headers, data.memberId);
    } catch (err) {
      toResponseError(err);
    }
  });

export const createTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      await requireActor(env, headers, perm({ team: ["create"] }));
      return await createTeam(env, headers, data.name);
    } catch (err) {
      toResponseError(err);
    }
  });

export const renameTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ team: ["update"] }));
      await renameTeam(env, actor, headers, data.id, data.name);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ teamId: id })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ team: ["delete"] }));
      await deleteTeam(env, actor, headers, data.teamId);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setTeamMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ teamId: id, memberId: id, on: z.boolean() })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, perm({ team: ["update"] }));
      await setTeamMember(env, actor, headers, data.teamId, data.memberId, data.on);
    } catch (err) {
      toResponseError(err);
    }
  });

export const getInviteFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      return await getInvite(env, getRequestHeaders(), data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      await acceptInvite(env, getRequestHeaders(), data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
