import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { read, READ } from "./guard";
import { getOverview } from "../services/overview";

// Null means no numbers: a role without usage (member), or no active workspace in the session (suspended-only shell).
export const fetchOverview = createServerFn({ method: "GET" }).handler(() => read(READ("workspace", "usage"), (actor) => getOverview(env, actor)));
