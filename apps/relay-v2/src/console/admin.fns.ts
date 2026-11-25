import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePlatformAdmin, toResponseError } from "./actor";
import { AUDIENCE_BINDINGS } from "../core/audience-hook";
import {
  listWorkspaces,
  MAX_INVITES_PER_DAY,
  MAX_MONTHLY_QUOTA,
  setAudienceBindingFor,
  setWorkspaceInviteCap,
  setWorkspaceQuota, setWorkspaceRegion,
  setWorkspaceStatus,
} from "./admin";
import { validate } from "./schemas";

export const fetchWorkspaces = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const admin = await requirePlatformAdmin(env, getRequestHeaders());
    return await listWorkspaces(env, admin);
  } catch (err) {
    toResponseError(err);
  }
});

export const setWorkspaceStatusFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), status: z.enum(["active", "suspended"]) })))
  .handler(async ({ data }) => {
    try {
      const admin = await requirePlatformAdmin(env, getRequestHeaders(), { write: true });
      await setWorkspaceStatus(env, admin, data.workspaceId, data.status);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setWorkspaceRegionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), region: z.string().min(1).max(40) })))
  .handler(async ({ data }) => {
    try {
      const admin = await requirePlatformAdmin(env, getRequestHeaders(), { write: true });
      await setWorkspaceRegion(env, admin, data.workspaceId, data.region);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setWorkspaceQuotaFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), quota: z.number().int().min(0).max(MAX_MONTHLY_QUOTA) })))
  .handler(async ({ data }) => {
    try {
      const admin = await requirePlatformAdmin(env, getRequestHeaders(), { write: true });
      await setWorkspaceQuota(env, admin, data.workspaceId, data.quota);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setWorkspaceInviteCapFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), cap: z.number().int().min(1).max(MAX_INVITES_PER_DAY) })))
  .handler(async ({ data }) => {
    try {
      const admin = await requirePlatformAdmin(env, getRequestHeaders(), { write: true });
      await setWorkspaceInviteCap(env, admin, data.workspaceId, data.cap);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setAudienceBindingFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ workspaceId: z.string().min(1), appId: z.string().min(1), binding: z.enum(AUDIENCE_BINDINGS) })))
  .handler(async ({ data }) => {
    try {
      const admin = await requirePlatformAdmin(env, getRequestHeaders(), { write: true });
      return await setAudienceBindingFor(env, admin, data.workspaceId, data.appId, data.binding);
    } catch (err) {
      toResponseError(err);
    }
  });
