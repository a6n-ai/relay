import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import { deleteFailureFor, listFailuresFor, replayFailureFor } from "../services/failures";
import { id, validate } from "./schemas";
import { RelayError } from "../shared/errors";

const READ = { permission: { mailbox: ["read"] } };
const MANAGE = { permission: { mailbox: ["manage"] }, write: true };

// Null means the role cannot read inbound mail: the page shows a denied state instead of an error.
export const fetchFailures = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), READ);
    return { rows: await listFailuresFor(env, actor) };
  } catch (err) {
    if (err instanceof RelayError && err.status === 403) return null;
    toResponseError(err);
  }
});

export const replayFailureFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), MANAGE);
      return await replayFailureFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteFailureFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), MANAGE);
      await deleteFailureFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
