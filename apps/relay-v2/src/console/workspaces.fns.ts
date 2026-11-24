import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { toResponseError } from "./actor";
import { createWorkspace } from "./workspaces";
import { name, slug } from "./schemas";

export const createWorkspaceFn = createServerFn({ method: "POST" })
  .validator(z.object({ name, slug }))
  .handler(async ({ data }) => {
    try {
      return await createWorkspace(env, getRequestHeaders(), data);
    } catch (err) {
      toResponseError(err);
    }
  });
