import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ConsoleError, requireActor, toResponseError } from "./actor";
import {
  addApp,
  createKey,
  deleteAudienceHookFor,
  getApp,
  getAudienceHookFor,
  listApps,
  listKeys,
  revokeKey,
  setAudienceHookFor,
} from "./apps";
import { appId, id, name, slug, validate } from "./schemas";

const READ = { permission: { tenant: ["read"] } };
const WRITE = { permission: { tenant: ["write"] }, write: true };

// Null means no workspace or a suspended one: the page shows a denied state with a 200, not an error status.
export const fetchApps = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), READ);
    return await listApps(env, actor);
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 403) return null;
    toResponseError(err);
  }
});

export const fetchAppDetail = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      const [app, keys] = await Promise.all([getApp(env, actor, data.appId), listKeys(env, actor, data.appId)]);
      return { app, keys };
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const createAppFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name, slug })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await addApp(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

// The only place a key secret leaves the server: the create response, shown once by the dialog.
export const createKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, name })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await createKey(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const revokeKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await revokeKey(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const fetchAudienceHook = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await getAudienceHookFor(env, actor, data.appId);
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      toResponseError(err);
    }
  });

// The plaintext secret is returned here once, for the dialog that generated it.
export const setAudienceHookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, url: z.string().max(2048), secret: z.string().max(256).optional(), enabled: z.boolean().optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await setAudienceHookFor(env, actor, data.appId, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteAudienceHookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await deleteAudienceHookFor(env, actor, data.appId);
    } catch (err) {
      toResponseError(err);
    }
  });
