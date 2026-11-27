import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { fail, read, run, WRITE } from "./guard";
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
} from "../services/members";
import { id, inviteInput, name, role, validate } from "./schemas";

// Null means no workspace or a suspended one: the page shows a denied state with a 200, not an error status.
export const fetchPeople = createServerFn({ method: "GET" }).handler(() => read({}, (actor) => listPeople(env, actor)));

export const inviteMemberFn = createServerFn({ method: "POST" })
  .validator(validate(inviteInput))
  .handler(({ data }) => run(WRITE("invitation", "create"), (actor) => inviteMember(env, actor, getRequestHeaders(), data)));

export const cancelInviteFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(WRITE("invitation", "cancel"), (actor) => cancelInvite(env, actor, getRequestHeaders(), data.id)));

export const changeRoleFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ memberId: id, role })))
  .handler(({ data }) => run(WRITE("member", "update"), (actor) => changeRole(env, actor, getRequestHeaders(), data.memberId, data.role)));

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ memberId: id })))
  .handler(({ data }) => run(WRITE("member", "delete"), (actor) => removeMember(env, actor, getRequestHeaders(), data.memberId)));

export const createTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name })))
  .handler(({ data }) => run(WRITE("team", "create"), () => createTeam(env, getRequestHeaders(), data.name)));

export const renameTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(({ data }) => run(WRITE("team", "update"), (actor) => renameTeam(env, actor, getRequestHeaders(), data.id, data.name)));

export const deleteTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ teamId: id })))
  .handler(({ data }) => run(WRITE("team", "delete"), (actor) => deleteTeam(env, actor, getRequestHeaders(), data.teamId)));

export const setTeamMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ teamId: id, memberId: id, on: z.boolean() })))
  .handler(({ data }) =>
    run(WRITE("team", "update"), (actor) => setTeamMember(env, actor, getRequestHeaders(), data.teamId, data.memberId, data.on)),
  );

// The invite page runs before the user belongs to the workspace, so these check the session themselves.
export const getInviteFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      return await getInvite(env, getRequestHeaders(), data.id);
    } catch (err) {
      fail(err);
    }
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      await acceptInvite(env, getRequestHeaders(), data.id);
    } catch (err) {
      fail(err);
    }
  });
