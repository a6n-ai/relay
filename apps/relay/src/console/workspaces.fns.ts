import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { fail, run } from "./guard";
import { WRITE } from "./needs";
import { createWorkspace, deleteWorkspace, renameWorkspace } from "../services/workspaces";
import { name, slug, validate } from "./schemas";

export const createWorkspaceFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name, slug })))
  .handler(async ({ data }) => {
    try {
      return await createWorkspace(env, getRequestHeaders(), data);
    } catch (err) {
      fail(err);
    }
  });

export const renameWorkspaceFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ name })))
  .handler(({ data }) => run(WRITE("organization", "update"), (p) => renameWorkspace(env, p, getRequestHeaders(), data.name)));

export const deleteWorkspaceFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ slug })))
  .handler(({ data }) => run(WRITE("organization", "delete"), (p) => deleteWorkspace(env, p, getRequestHeaders(), data.slug)));
