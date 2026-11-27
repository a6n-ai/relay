import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, READ, run, WRITE } from "./guard";
import { addApp, createKey, deleteKey, getApp, getDefaultSenders, listApps, listKeys, renameApp, renameKey, revokeKey, setDefaultSendersFor } from "../services/apps";
import { deleteAudienceHook, getAudienceHook, setAudienceHook } from "../services/audience-hook";
import { fromActor } from "../services/principal";
import { appId, id, name, slug, validate } from "./schemas";
import { URL_MAX } from "../shared/limits";

const VIEW = READ("tenant", "read");
const EDIT = WRITE("tenant", "write");

// Null means no workspace or a suspended one: the page shows a denied state with a 200, not an error status.
export const fetchApps = createServerFn({ method: "GET" }).handler(() => read(VIEW, (actor) => listApps(env, actor)));

export const fetchAppDetail = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) =>
    read(VIEW, async (actor) => {
      const [app, keys, senders] = await Promise.all([
        getApp(env, actor, data.appId),
        listKeys(env, actor, data.appId),
        getDefaultSenders(env, actor, data.appId),
      ]);
      return { app, keys, senders };
    }),
  );

export const createAppFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name, slug })))
  .handler(({ data }) => run(EDIT, (actor) => addApp(env, actor, data)));

// The only place a key secret leaves the server: the create response, shown once by the dialog.
export const createKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, name })))
  .handler(({ data }) => run(EDIT, (actor) => createKey(env, actor, data)));

export const revokeKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => revokeKey(env, actor, data.id)));

export const fetchAudienceHook = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) => read(VIEW, (actor) => getAudienceHook(env, fromActor(actor), data.appId)));

// The plaintext secret is returned here once, for the dialog that generated it.
export const setAudienceHookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, url: z.string().max(URL_MAX), secret: z.string().max(256).optional(), enabled: z.boolean().optional() })))
  .handler(({ data }) => run(EDIT, (actor) => setAudienceHook(env, fromActor(actor), data.appId, data)));

export const deleteAudienceHookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) => run(EDIT, (actor) => deleteAudienceHook(env, fromActor(actor), data.appId)));

export const setAppDefaultSendersFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, transactionalId: id.nullable(), marketingId: id.nullable() })))
  .handler(({ data }) => run(EDIT, (actor) => setDefaultSendersFor(env, actor, data.appId, data)));

export const updateAppFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(({ data }) => run(EDIT, (actor) => renameApp(env, actor, data.id, data.name)));

export const deleteKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => deleteKey(env, actor, data.id)));

export const renameKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(({ data }) => run(EDIT, (actor) => renameKey(env, actor, data.id, data.name)));
