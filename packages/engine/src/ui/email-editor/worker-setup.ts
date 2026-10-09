/**
 * Warm the renderer before locking network globals: react-email's render()
 * lazily imports react-dom/server, and in a worker the bundler loads that
 * chunk with importScripts — which the lockdown blocks. Locks even if warm-up fails.
 */
export function prepareCompileWorker({ warmUp, lock }: { warmUp: () => Promise<unknown>; lock: () => void }): Promise<void> {
  return warmUp()
    .catch(() => undefined)
    .then(() => lock());
}
