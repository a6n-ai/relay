import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { ConsoleError, requireActor, toResponseError } from "./actor";
import { validate } from "./schemas";
import { addSuppressionFor, listSuppressionsFor, removeSuppressionFor } from "./suppressions";

const READ = { permission: { sending: ["read"] } };
const WRITE = { permission: { sending: ["write"] }, write: true };

// Null means the role cannot see suppressions: the page shows a denied state instead of an error.
export const fetchSuppressions = createServerFn({ method: "GET" })
  .validator(
    validate(
      z.object({
        prefix: z.string().max(254).optional(),
        cursor: z.string().max(254).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listSuppressionsFor(env, actor, data);
    } catch (err) {
      if (err instanceof ConsoleError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const addSuppressionFn = createServerFn({ method: "POST" })
  .validator(
    validate(
      z.object({
        email: z.string().trim().toLowerCase().max(254).email(),
        stream: z.enum(["transactional", "tracked", "marketing"]).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await addSuppressionFor(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const removeSuppressionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ email: z.string().trim().toLowerCase().max(254) })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await removeSuppressionFor(env, actor, data.email);
    } catch (err) {
      toResponseError(err);
    }
  });
