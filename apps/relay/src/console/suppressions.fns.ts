import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { validate } from "./schemas";
import { addSuppression, listSuppressions, removeSuppression } from "../services/suppressions";
import { STREAMS, SUPPRESSION_REASONS } from "../shared/mail";
import { emailSchema } from "../shared/schemas";

const VIEW = READ("sending", "read");
const EDIT = WRITE("sending", "write");

// Null means the role cannot see suppressions: the page shows a denied state instead of an error.
export const fetchSuppressions = createServerFn({ method: "GET" })
  .validator(validate(z.object({ prefix: z.string().max(254).optional(), cursor: z.string().max(270).optional() })))
  .handler(({ data }) => read(VIEW, (p) => listSuppressions(env, p, data)));

export const addSuppressionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ email: emailSchema, stream: z.enum(STREAMS).optional() })))
  .handler(({ data }) => run(EDIT, (p) => addSuppression(env, p, data)));

export const removeSuppressionFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ email: emailSchema, reason: z.enum(SUPPRESSION_REASONS) })))
  .handler(({ data }) => run(EDIT, (p) => removeSuppression(env, p, data.email, data.reason)));
