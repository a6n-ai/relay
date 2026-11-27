import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { SES_REGION_IDS } from "../shared/regions";
import { read, READ, run, WRITE } from "./guard";
import { deleteDomain, domainDeletePreview as domainDeletePreviewFor } from "../services/domain-delete";
import {
  addAddress,
  addDomain,
  checkDomain,
  listAddresses,
  listDomains,
  releaseDomain,
  removeAddress,
  setDomainProtected,
  updateAddress,
} from "../services/domains";
import { displayName, id, replyTo, validate } from "./schemas";

const VIEW = READ("sending", "read");
const EDIT = WRITE("sending", "write");

// Null means the role cannot read sending domains (billing): the page shows a denied state instead of an error.
export const fetchDomains = createServerFn({ method: "GET" }).handler(() => read(VIEW, (actor) => listDomains(env, actor)));

export const fetchAddresses = createServerFn({ method: "GET" }).handler(() => run(VIEW, (actor) => listAddresses(env, actor)));

export const addDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ domain: z.string().min(1).max(253), sesRegion: z.enum(SES_REGION_IDS).optional() })))
  .handler(({ data }) => run(EDIT, (actor) => addDomain(env, actor, data)));

export const checkDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => checkDomain(env, actor, data.id)));

export const releaseDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => releaseDomain(env, actor, data.id)));

export const setDomainProtectedFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, protected: z.boolean() })))
  .handler(({ data }) => run(EDIT, (actor) => setDomainProtected(env, actor, data.id, data.protected)));

export const domainDeletePreview = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(VIEW, (actor) => domainDeletePreviewFor(env, actor, data.id)));

export const deleteDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, confirm: z.string().trim().min(1).max(253), deleteHistory: z.boolean() })))
  .handler(({ data }) => run(EDIT, (actor) => deleteDomain(env, actor, data.id, { confirm: data.confirm, deleteHistory: data.deleteHistory })));

export const addAddressFn = createServerFn({ method: "POST" })
  .validator(
    validate(
      z.object({
        appId: id,
        email: z.string().trim().min(3).max(254),
        kind: z.enum(["inbox", "sender", "both"]),
        displayName,
        replyTo,
      }),
    ),
  )
  .handler(({ data }) => run(EDIT, (actor) => addAddress(env, actor, data)));

export const updateAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, displayName: displayName.nullable(), replyTo })))
  .handler(({ data }) => {
    const { id: addressId, ...patch } = data;
    return run(EDIT, (actor) => updateAddress(env, actor, addressId, patch));
  });

export const removeAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (actor) => removeAddress(env, actor, data.id)));
