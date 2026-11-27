import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { orMissing, read } from "./guard";
import { READ } from "./needs";
import { getMessage, listMessages } from "../services/inbox";
import { appId, id, validate } from "./schemas";
import { MESSAGE_STATUSES } from "../shared/mail";

const LOG_READ = READ("log", "read");
const MAIL_READ = READ("mailbox", "read");

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
  .handler(({ data }) =>
    read(data.dir === "out" ? LOG_READ : MAIL_READ, (p) =>
      listMessages(env, p, {
        direction: data.dir,
        appId: data.app,
        status: data.status,
        email: data.email,
        cursor: data.cursor,
      }),
    ),
  );

// Null means denied; { missing: true } means the message does not exist or is not visible to this reader.
export const fetchMessage = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id, images: z.boolean().optional() })))
  .handler(({ data }) =>
    read(LOG_READ, orMissing(async (p) => ({ message: await getMessage(env, p, data.id, { images: data.images === true }) }))),
  );
