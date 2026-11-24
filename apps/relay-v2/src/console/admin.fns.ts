import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePlatformAdmin, toResponseError } from "./actor";
import { listWorkspaces, MAX_MONTHLY_QUOTA, setWorkspaceQuota, setWorkspaceStatus } from "./admin";
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
