import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import { createWorkspace, renameWorkspace } from "./workspaces";
import { name, slug, validate } from "./schemas";

export const createWorkspaceFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name, slug })))
  .handler(async ({ data }) => {
    try {
      return await createWorkspace(env, getRequestHeaders(), data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const renameWorkspaceFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name })))
  .handler(async ({ data }) => {
    try {
      const headers = getRequestHeaders();
      const actor = await requireActor(env, headers, { permission: { organization: ["update"] }, write: true });
      await renameWorkspace(env, actor, headers, data.name);
    } catch (err) {
      toResponseError(err);
    }
  });
