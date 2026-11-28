import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { deleteFailure, listFailures, replayFailure } from "../services/failures";
import { validate } from "./schemas";
import { id } from "../services/schemas";

const VIEW = READ("mailbox", "read");
const MANAGE = WRITE("mailbox", "manage");

// Null means the role cannot read inbound mail: the page shows a denied state instead of an error.
export const fetchFailures = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id.optional(), cursor: z.string().max(64).optional() })))
  .handler(({ data }) =>
    read(VIEW, async (p) => {
      const { rows, nextCursor } = await listFailures(env, p, data);
      return { rows, nextCursor };
    }),
  );

export const replayFailureFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(MANAGE, (p) => replayFailure(env, p, data.id)));

export const deleteFailureFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(MANAGE, (p) => deleteFailure(env, p, data.id)));
