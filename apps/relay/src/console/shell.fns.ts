import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { fail } from "./guard";
import { googleConfig } from "../auth/google";
import { loadShell } from "../services/shell";
import { RelayError } from "../shared/errors";
import { type Shell } from "../shared/views";

// Null means signed out; the layout turns that into a redirect to sign-in.
export const getShell = createServerFn({ method: "GET" }).handler(async (): Promise<Shell | null> => {
  const setCookies: string[] = [];
  try {
    const shell = await loadShell(env, getRequestHeaders(), setCookies);
    if (setCookies.length > 0) setResponseHeader("set-cookie", setCookies);
    return shell;
  } catch (err) {
    if (err instanceof RelayError && err.status === 401) return null;
    fail(err);
  }
});

export const authOptionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ google: boolean }> => ({ google: googleConfig(env) !== null }),
);
