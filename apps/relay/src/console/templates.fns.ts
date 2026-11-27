import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { id, validate } from "./schemas";
import { templateInput, templatePatch } from "../services/schemas";
import { createTemplate, deleteTemplate, getTemplate, listTemplates, previewTemplate, updateTemplate } from "../services/templates";

const VIEW = READ("template", "read");
const EDIT = WRITE("template", "write");

// Null means the role cannot see templates: the page shows a denied state instead of an error.
export const fetchTemplates = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id, cursor: z.string().max(254).optional() })))
  .handler(({ data }) => read(VIEW, (p) => listTemplates(env, p, data.appId, data.cursor)));

export const fetchTemplate = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (p) => getTemplate(env, p, data.id)));

export const previewTemplateFn = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, (p) => previewTemplate(env, p, data.id)));

export const createTemplateFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, input: templateInput })))
  .handler(({ data }) => run(EDIT, (p) => createTemplate(env, p, data.appId, data.input)));

export const updateTemplateFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: templatePatch })))
  .handler(({ data }) => run(EDIT, (p) => updateTemplate(env, p, data.id, data.patch)));

export const deleteTemplateFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(EDIT, (p) => deleteTemplate(env, p, data.id)));
