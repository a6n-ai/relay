import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import { addGrant, getAddressAccess, removeGrant } from "./grants";
import { id, validate } from "./schemas";
import { RelayError } from "../shared/errors";

const READ = { permission: { mailbox: ["manage"] } };
const WRITE = { permission: { mailbox: ["manage"] }, write: true };

// Null means the role cannot manage this address's access: the page shows a denied state instead of an error.
export const fetchAddressAccess = createServerFn({ method: "GET" })
  .validator(validate(z.object({ addressId: id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await getAddressAccess(env, actor, data.addressId);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const addGrantFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ addressId: id, memberId: id.optional(), teamId: id.optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await addGrant(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const removeGrantFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await removeGrant(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
