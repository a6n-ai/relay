import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, READ, run, WRITE } from "./guard";
import { deleteFailureFor, listFailuresFor, replayFailureFor } from "../services/failures";
import { id, validate } from "./schemas";

const VIEW = READ("mailbox", "read");
const MANAGE = WRITE("mailbox", "manage");

// Null means the role cannot read inbound mail: the page shows a denied state instead of an error.
export const fetchFailures = createServerFn({ method: "GET" }).handler(() =>
  read(VIEW, async (actor) => ({ rows: await listFailuresFor(env, actor) })),
);

export const replayFailureFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(MANAGE, (actor) => replayFailureFor(env, actor, data.id)));

export const deleteFailureFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(MANAGE, (actor) => deleteFailureFor(env, actor, data.id)));
