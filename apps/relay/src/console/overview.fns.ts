import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireActor, toResponseError } from "./actor";
import { getOverview, type Overview } from "../services/overview";
import { RelayError } from "../shared/errors";

// Null means no numbers: a role without usage (member), or no active workspace in the session (suspended-only shell).
export const fetchOverview = createServerFn({ method: "GET" }).handler(async (): Promise<Overview | null> => {
  try {
    const actor = await requireActor(env, getRequestHeaders(), { permission: { workspace: ["usage"] } });
    return await getOverview(env, actor);
  } catch (err) {
    if (err instanceof RelayError && err.status === 403) return null;
    toResponseError(err);
  }
});
