import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, READ, run, WRITE } from "./guard";
import { addGrant, getAddressAccess, removeGrant } from "../services/grants";
import { id, validate } from "./schemas";

const VIEW = READ("mailbox", "manage");
const EDIT = WRITE("mailbox", "manage");

// Null means the role cannot manage this address's access: the page shows a denied state instead of an error.
export const fetchAddressAccess = createServerFn({ method: "GET" })
  .validator(validate(z.object({ addressId: id })))
  .handler(({ data }) => read(VIEW, (actor) => getAddressAccess(env, actor, data.addressId)));

export const addGrantFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ addressId: id, memberId: id.optional(), teamId: id.optional() })))
  .handler(({ data }) => run(EDIT, (actor) => addGrant(env, actor, data)));

export const removeGrantFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => removeGrant(env, actor, data.id)));
