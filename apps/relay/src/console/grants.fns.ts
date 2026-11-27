import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { addGrant, getAddressAccess, removeGrant } from "../services/grants";
import { id, validate } from "./schemas";

const VIEW = READ("mailbox", "manage");
const EDIT = WRITE("mailbox", "manage");

// Null means the role cannot manage this address's access: the page shows a denied state instead of an error.
export const fetchAddressAccess = createServerFn({ method: "GET" })
  .validator(validate(z.object({ addressId: id })))
  .handler(({ data }) => read(VIEW, (p) => getAddressAccess(env, p, data.addressId)));

export const addGrantFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ addressId: id, memberId: id.optional(), teamId: id.optional() })))
  .handler(({ data }) => run(EDIT, (p) => addGrant(env, p, data)));

export const removeGrantFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => removeGrant(env, p, data.id)));
