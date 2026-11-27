import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { requireActor, toResponseError } from "./actor";
import {
  createTemplateFor,
  deleteTemplateFor,
  getTemplateFor,
  listTemplatesFor,
  previewTemplateFor,
  updateTemplateFor,
} from "./templates";
import { id, validate } from "./schemas";
import { templateInput, templatePatch } from "../services/schemas";
import { RelayError } from "../shared/errors";

const READ = { permission: { template: ["read"] } };
const WRITE = { permission: { template: ["write"] }, write: true };

// Null means the role cannot see templates: the page shows a denied state instead of an error.
export const fetchTemplates = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id, cursor: z.string().max(254).optional() })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await listTemplatesFor(env, actor, data.appId, data.cursor);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const fetchTemplate = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await getTemplateFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const previewTemplateFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), READ);
      return await previewTemplateFor(env, actor, data.id);
    } catch (err) {
      if (err instanceof RelayError && err.status === 403) return null;
      toResponseError(err);
    }
  });

export const createTemplateFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, input: templateInput })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await createTemplateFor(env, actor, data.appId, data.input);
    } catch (err) {
      toResponseError(err);
    }
  });

export const updateTemplateFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: templatePatch })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      return await updateTemplateFor(env, actor, data.id, data.patch);
    } catch (err) {
      toResponseError(err);
    }
  });

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(async ({ data }) => {
    try {
      const actor = await requireActor(env, getRequestHeaders(), WRITE);
      await deleteTemplateFor(env, actor, data.id);
    } catch (err) {
      toResponseError(err);
    }
  });
