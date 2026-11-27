import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, READ, run, WRITE } from "./guard";
import { validate } from "./schemas";
import { addSuppressionFor, listSuppressionsFor, removeSuppressionFor } from "../services/suppressions";
import { STREAMS } from "../shared/mail";
import { emailSchema } from "../shared/schemas";

const VIEW = READ("sending", "read");
const EDIT = WRITE("sending", "write");

// Null means the role cannot see suppressions: the page shows a denied state instead of an error.
export const fetchSuppressions = createServerFn({ method: "GET" })
  .validator(validate(z.object({ prefix: z.string().max(254).optional(), cursor: z.string().max(254).optional() })))
  .handler(({ data }) => read(VIEW, (actor) => listSuppressionsFor(env, actor, data)));

export const addSuppressionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ email: emailSchema, stream: z.enum(STREAMS).optional() })))
  .handler(({ data }) => run(EDIT, (actor) => addSuppressionFor(env, actor, data)));

export const removeSuppressionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ email: emailSchema })))
  .handler(({ data }) => run(EDIT, (actor) => removeSuppressionFor(env, actor, data.email)));
