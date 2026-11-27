import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { runAdmin } from "./guard";
import {
  AUDIENCE_BINDINGS,
  listWorkspaces,
  setAudienceBinding,
  setWorkspaceInviteCap,
  setWorkspaceQuota,
  setWorkspaceRegion,
  setWorkspaceStatus,
} from "../services/admin";
import { MAX_INVITES_PER_DAY, MAX_MONTHLY_QUOTA } from "../shared/limits";
import { validate } from "./schemas";

export const fetchWorkspaces = createServerFn({ method: "GET" }).handler(() => runAdmin(() => listWorkspaces(env), { write: false }));

export const setWorkspaceStatusFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), status: z.enum(["active", "suspended"]) })))
  .handler(({ data }) => runAdmin((admin) => setWorkspaceStatus(env, admin, data.workspaceId, data.status)));

export const setWorkspaceRegionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), region: z.string().min(1).max(40) })))
  .handler(({ data }) => runAdmin((admin) => setWorkspaceRegion(env, admin, data.workspaceId, data.region)));

export const setWorkspaceQuotaFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), quota: z.number().int().min(0).max(MAX_MONTHLY_QUOTA) })))
  .handler(({ data }) => runAdmin((admin) => setWorkspaceQuota(env, admin, data.workspaceId, data.quota)));

export const setWorkspaceInviteCapFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), cap: z.number().int().min(1).max(MAX_INVITES_PER_DAY) })))
  .handler(({ data }) => runAdmin((admin) => setWorkspaceInviteCap(env, admin, data.workspaceId, data.cap)));

export const setAudienceBindingFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), appId: z.string().min(1), binding: z.enum(AUDIENCE_BINDINGS) })))
  .handler(({ data }) => runAdmin((admin) => setAudienceBinding(env, admin, data.workspaceId, data.appId, data.binding)));
