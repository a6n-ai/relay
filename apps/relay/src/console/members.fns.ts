import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { fail, read, run, userSession } from "./guard";
import { WRITE } from "./needs";
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
  suggestMailboxFor,
} from "../services/members";
import { inviteInput, role, validate } from "./schemas";
import { id, name } from "../services/schemas";

// Null means no workspace or no access: the page shows a denied state with a 200, not an error status. A suspended workspace still reads; only writes are refused.
export const fetchPeople = createServerFn({ method: "GET" }).handler(() => read({}, (p) => listPeople(env, p)));

export const inviteMemberFn = createServerFn({ method: "POST" })
  .validator(validate(inviteInput))
  .handler(({ data }) => run(WRITE("invitation", "create"), (p) => inviteMember(env, p, getRequestHeaders(), data)));

export const suggestMailboxFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name, domain: z.string().trim().toLowerCase().min(1).max(253) })))
  .handler(({ data }) =>
    run(WRITE("invitation", "create"), async (p) => ({ mailbox: await suggestMailboxFor(env, p, data.name, data.domain) })),
  );

export const cancelInviteFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(WRITE("invitation", "cancel"), (p) => cancelInvite(env, p, getRequestHeaders(), data.id)));

export const changeRoleFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ memberId: id, role })))
  .handler(({ data }) => run(WRITE("member", "update"), (p) => changeRole(env, p, getRequestHeaders(), data.memberId, data.role)));

export const removeMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ memberId: id })))
  .handler(({ data }) => run(WRITE("member", "delete"), (p) => removeMember(env, p, getRequestHeaders(), data.memberId)));

export const createTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name })))
  .handler(({ data }) => run(WRITE("team", "create"), () => createTeam(env, getRequestHeaders(), data.name)));

export const renameTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(({ data }) => run(WRITE("team", "update"), (p) => renameTeam(env, p, getRequestHeaders(), data.id, data.name)));

export const deleteTeamFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ teamId: id })))
  .handler(({ data }) => run(WRITE("team", "delete"), (p) => deleteTeam(env, p, getRequestHeaders(), data.teamId)));

export const setTeamMemberFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ teamId: id, memberId: id, on: z.boolean() })))
  .handler(({ data }) =>
    run(WRITE("team", "update"), (p) => setTeamMember(env, p, getRequestHeaders(), data.teamId, data.memberId, data.on)),
  );

// The invite page runs before the user belongs to the workspace, so these check the session themselves.
export const getInviteFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      return await getInvite(env, await userSession(), data.id);
    } catch (err) {
      fail(err);
    }
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      await acceptInvite(env, await userSession({ write: true }), data.id);
    } catch (err) {
      fail(err);
    }
  });
