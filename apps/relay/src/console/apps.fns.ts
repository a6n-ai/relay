import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { addApp, createKey, deleteKey, getApp, getDefaultSenders, listApps, listKeys, renameApp, renameKey, revokeKey, setDefaultSenders } from "../services/apps";
import { deleteAudienceHook, getAudienceHook, setAudienceHook } from "../services/audience-hook";
import { appId, slug, validate } from "./schemas";
import { id, name } from "../services/schemas";
import { URL_MAX } from "../shared/limits";

const VIEW = READ("tenant", "read");
const EDIT = WRITE("tenant", "write");

// Null means no workspace or no access: the page shows a denied state with a 200, not an error status. A suspended workspace still reads; only writes are refused.
export const fetchApps = createServerFn({ method: "GET" }).handler(() => read(VIEW, (p) => listApps(env, p)));

export const fetchAppDetail = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) =>
    read(VIEW, async (p) => {
      const [app, keys, senders] = await Promise.all([
        getApp(env, p, data.appId),
        listKeys(env, p, data.appId),
        getDefaultSenders(env, p, data.appId),
      ]);
      return { app, keys, senders };
    }),
  );

export const createAppFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name, slug })))
  .handler(({ data }) => run(EDIT, (p) => addApp(env, p, data)));

// The only place a key secret leaves the server: the create response, shown once by the dialog.
export const createKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, name })))
  .handler(({ data }) => run(EDIT, (p) => createKey(env, p, data)));

export const revokeKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => revokeKey(env, p, data.id)));

export const fetchAudienceHook = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) => read(VIEW, (p) => getAudienceHook(env, p, data.appId)));

// The plaintext secret is returned here once, for the dialog that generated it.
export const setAudienceHookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, url: z.string().max(URL_MAX), secret: z.string().max(256).optional(), enabled: z.boolean().optional() })))
  .handler(({ data }) => run(EDIT, (p) => setAudienceHook(env, p, data.appId, data)));

export const deleteAudienceHookFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId })))
  .handler(({ data }) => run(EDIT, (p) => deleteAudienceHook(env, p, data.appId)));

export const setAppDefaultSendersFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId, transactionalId: id.nullable(), marketingId: id.nullable() })))
  .handler(({ data }) => run(EDIT, (p) => setDefaultSenders(env, p, data.appId, data)));

export const updateAppFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(({ data }) => run(EDIT, (p) => renameApp(env, p, data.id, data.name)));

export const deleteKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => deleteKey(env, p, data.id)));

export const renameKeyFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, name })))
  .handler(({ data }) => run(EDIT, (p) => renameKey(env, p, data.id, data.name)));
