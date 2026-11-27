import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { SES_REGION_IDS } from "../shared/regions";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { deleteDomain, previewDomainDelete } from "../services/domain-delete";
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
import { closePersonalMailbox, listPersonalMailboxes, reopenPersonalMailbox } from "../services/personal-mailboxes";
import { displayName, replyTo, validate } from "./schemas";
import { id } from "../services/schemas";

// Members never see Domains: reading it takes the same permission as editing it.
const VIEW = READ("sending", "write");
const EDIT = WRITE("sending", "write");

// Null means the role cannot read sending domains (billing): the page shows a denied state instead of an error.
export const fetchDomains = createServerFn({ method: "GET" }).handler(() => read(VIEW, (p) => listDomains(env, p)));

export const fetchAddresses = createServerFn({ method: "GET" }).handler(() => run(VIEW, (p) => listAddresses(env, p)));

export const addDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ domain: z.string().min(1).max(253), sesRegion: z.enum(SES_REGION_IDS).optional() })))
  .handler(({ data }) => run(EDIT, (p) => addDomain(env, p, data)));

export const checkDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => checkDomain(env, p, data.id)));

export const releaseDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => releaseDomain(env, p, data.id)));

export const setDomainProtectedFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, protected: z.boolean() })))
  .handler(({ data }) => run(EDIT, (p) => setDomainProtected(env, p, data.id, data.protected)));

export const domainDeletePreview = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => previewDomainDelete(env, p, data.id)));

export const deleteDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, confirm: z.string().trim().min(1).max(253), deleteHistory: z.boolean() })))
  .handler(({ data }) => run(EDIT, (p) => deleteDomain(env, p, data.id, { confirm: data.confirm, deleteHistory: data.deleteHistory })));

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
  .handler(({ data }) => run(EDIT, (p) => addAddress(env, p, data)));

export const updateAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, displayName: displayName.nullable(), replyTo })))
  .handler(({ data }) => {
    const { id: addressId, ...patch } = data;
    return run(EDIT, (p) => updateAddress(env, p, addressId, patch));
  });

export const removeAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => removeAddress(env, p, data.id)));

const MANAGE = WRITE("mailbox", "manage");

export const fetchPersonalMailboxes = createServerFn({ method: "GET" }).handler(() => read(READ("mailbox", "manage"), (p) => listPersonalMailboxes(env, p)));

export const closePersonalMailboxFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(MANAGE, (p) => closePersonalMailbox(env, p, data.id)));

export const reopenPersonalMailboxFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(MANAGE, (p) => reopenPersonalMailbox(env, p, data.id)));
