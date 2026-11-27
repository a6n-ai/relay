import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { SES_REGION_IDS } from "../shared/regions";
import { requireActor, toResponseError } from "./actor";
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
import { RelayError } from "../shared/errors";

const READ = { permission: { sending: ["read"] } };
const WRITE = { permission: { sending: ["write"] }, write: true };

// Null means the role cannot read sending domains (billing): the page shows a denied state instead of an error.
export const fetchDomains = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), READ);
    return await listDomains(env, actor);
  } catch (err) {
    if (err instanceof RelayError && err.status === 403) return null;
    toResponseError(err);
  }
});

export const fetchAddresses = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), READ);
    return await listAddresses(env, actor);
  } catch (err) {
    toResponseError(err);
  }
});

export const addDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ domain: z.string().min(1).max(253), sesRegion: z.enum(SES_REGION_IDS).optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await addDomain(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const checkDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await checkDomain(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const releaseDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await releaseDomain(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const setDomainProtectedFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, protected: z.boolean() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await setDomainProtected(env, actor, data.id, data.protected);
    } catch (err) {
      toResponseError(err);
    }
  });

export const domainDeletePreview = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await domainDeletePreviewFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteDomainFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, confirm: z.string().trim().min(1).max(253), deleteHistory: z.boolean() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await deleteDomain(env, actor, data.id, { confirm: data.confirm, deleteHistory: data.deleteHistory });
    } catch (err) {
      toResponseError(err);
    }
  });

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
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await addAddress(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, displayName: displayName.nullable(), replyTo })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      const { id: addressId, ...patch } = data;
      await updateAddress(env, actor, addressId, patch);
    } catch (err) {
      toResponseError(err);
    }
  });

export const removeAddressFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await removeAddress(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
