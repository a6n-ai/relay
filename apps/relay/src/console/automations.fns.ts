import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import { createAutomationFor, deleteAutomationFor, enableAutomationFor, getAutomationFor, listAutomationsFor, updateAutomationFor } from "../services/automations";
import { automationInput, automationPatch, id, validate } from "./schemas";
import { RelayError } from "../shared/errors";

const READ = { permission: { campaign: ["read"] } };
const SEND = { permission: { campaign: ["send"] }, write: true };

// { missing: true } means the app is not visible to this reader, the same as for lists.
export const fetchAutomations = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listAutomationsFor(env, actor, data.appId);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      if (err instanceof RelayError && err.status === 404) return { missing: true as const };
      toResponseError(err);
    }
  });

export const fetchAutomation = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await getAutomationFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      if (err instanceof RelayError && err.status === 404) return { missing: true as const };
      toResponseError(err);
    }
  });

export const createAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, automation: automationInput })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      return await createAutomationFor(env, actor, data.appId, data.automation);
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: automationPatch })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      return await updateAutomationFor(env, actor, data.id, data.patch);
    } catch (err) {
      toResponseError(err);
    }
  });

export const enableAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, on: z.boolean() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      return await enableAutomationFor(env, actor, data.id, data.on);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), SEND);
      await deleteAutomationFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
