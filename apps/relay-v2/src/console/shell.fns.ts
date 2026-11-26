import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { ConsoleError, toResponseError } from "./actor";
import { googleConfig } from "../lib/auth/google";
import { loadShell, type Shell } from "./shell";

// Browsers strip tabs and newlines from URLs, so "/\t/host" would become "//host".
const SAFE_PATH = /^\/(?![/\\])[^\\\s\x00-\x1f\x7f]*$/;

export function safeRedirect(path: string | undefined): string {
  return path && SAFE_PATH.test(path) ? path : "/";
}

// Null means signed out; the layout turns that into a redirect to sign-in.
export const getShell = createServerFn({ method: "GET" }).handler(async (): Promise<Shell | null> => {
  const setCookies: string[] = [];
  try {
    const shell = await loadShell(env, getRequestHeaders(), setCookies);
    if (setCookies.length > 0) setResponseHeader("set-cookie", setCookies);
    return shell;
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 401) return null;
    toResponseError(err);
  }
});

// The sign-in page shows the Google button only when both keys are set.
export const authOptionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ google: boolean }> => ({ google: googleConfig(env) !== null }),
);
