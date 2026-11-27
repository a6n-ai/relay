import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import { getMessageFor, listMessagesFor } from "./messages";
import { appId, id, validate } from "./schemas";
import { RelayError } from "../shared/errors";
import { MESSAGE_STATUSES } from "../shared/mail";

const LOG_READ = { permission: { log: ["read"] } };
const MAIL_READ = { permission: { mailbox: ["read"] } };

// Null means the role cannot read this direction (billing on inbound): the page shows a denied state.
export const fetchMessages = createServerFn({ method: "GET" })
  .validator(
    validate(
      z.object({
        dir: z.enum(["in", "out"]),
        app: appId.optional(),
        status: z.enum(MESSAGE_STATUSES).optional(),
        email: z.string().max(254).optional(),
        cursor: z.string().max(64).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), data.dir === "out" ? LOG_READ : MAIL_READ);
      return await listMessagesFor(env, actor, {
        direction: data.dir,
        appId: data.app,
        status: data.status,
        email: data.email,
        cursor: data.cursor,
      });
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

// Null means denied; { missing: true } means the message does not exist or is not visible to this reader.
export const fetchMessage = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id, images: z.boolean().optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), LOG_READ);
      return { message: await getMessageFor(env, actor, data.id, { images: data.images === true }) };
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      if (err instanceof RelayError && err.status === 404) return { missing: true as const };
      toResponseError(err);
    }
  });
