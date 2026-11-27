import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { orMissing, read, run } from "./guard";
import { READ, WRITE } from "./needs";
import { createAutomation, deleteAutomation, enableAutomation, getAutomation, listAutomations, updateAutomation } from "../services/automations";
import { automationInput, automationPatch, id, validate } from "./schemas";

const VIEW = READ("campaign", "read");
const SEND = WRITE("campaign", "send");

// { missing: true } means the app is not visible to this reader, the same as for lists.
export const fetchAutomations = createServerFn({ method: "GET" })
  .validator(validate(z.object({ appId: id })))
  .handler(({ data }) => read(VIEW, orMissing((p) => listAutomations(env, p, data.appId))));

export const fetchAutomation = createServerFn({ method: "GET" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => read(VIEW, orMissing((p) => getAutomation(env, p, data.id))));

export const createAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ appId: id, automation: automationInput })))
  .handler(({ data }) => run(SEND, (p) => createAutomation(env, p, data.appId, data.automation)));

export const updateAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, patch: automationPatch })))
  .handler(({ data }) => run(SEND, (p) => updateAutomation(env, p, data.id, data.patch)));

export const enableAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id, on: z.boolean() })))
  .handler(({ data }) => run(SEND, (p) => enableAutomation(env, p, data.id, data.on)));

export const deleteAutomationFn = createServerFn({ method: "POST" })
  .validator(validate(z.object({ id })))
  .handler(({ data }) => run(SEND, (p) => deleteAutomation(env, p, data.id)));
