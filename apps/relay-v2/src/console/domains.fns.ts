import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import {
  addAddress,
  addDomain,
  checkDomain,
  listAddresses,
  listDomains,
  removeAddress,
  updateAddress,
} from "./domains";

const READ = { permission: { sending: ["read"] } };
const WRITE = { permission: { sending: ["write"] }, write: true };

const id = z.string().min(1);
const displayName = z.string().trim().max(80).optional();

export const fetchDomains = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), READ);
    return await listDomains(env, actor);
  } catch (err) {
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
  .validator(z.object({ domain: z.string().min(1).max(253) }))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await addDomain(env, actor, data);
    } catch (err) {
      toResponseError(err);
    }
  });

export const checkDomainFn = createServerFn({ method: "POST" })
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await checkDomain(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });

export const addAddressFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      appId: id,
      email: z.string().trim().min(3).max(254),
      kind: z.enum(["inbox", "sender", "both"]),
      displayName,
      canSend: z.boolean().optional(),
    }),
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
  .validator(z.object({ id, displayName, canSend: z.boolean().optional() }))
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
  .validator(z.object({ id }))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await removeAddress(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
