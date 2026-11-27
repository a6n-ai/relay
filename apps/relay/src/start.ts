import { isNotFound, isRedirect } from "@tanstack/react-router";
import { createMiddleware, createStart } from "@tanstack/react-start";
import { failureOf, logFailure } from "./core/log";

// Every server function runs inside this, so every failure is logged once with the function's name: 4xx as a warning, 5xx as an error.
const logFailures = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  try {
    return await next();
  } catch (err) {
    if (!isRedirect(err) && !isNotFound(err)) {
      const failure = failureOf(err);
      logFailure(serverFnMeta.name, failure?.status ?? 500, failure?.cause ?? err);
    }
    throw err;
  }
});

export const startInstance = createStart(() => ({ functionMiddleware: [logFailures] }));
