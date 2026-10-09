/// <reference lib="webworker" />
import { compileReactSource } from "../react-template";
import { BLOCKED_WORKER_GLOBALS, lockDownGlobals } from "./lockdown";
import { prepareCompileWorker } from "./worker-setup";
// Static so it lands in the worker entry chunk rather than a lazily loaded one.
import "react-dom/server";

// Admin-pasted code runs here, never on the dashboard page. A worker has no DOM
// or cookies of its own; locking the network globals (whole prototype chain)
// stops template code calling our API with the admin's session.
// ponytail: not a true sandbox — `import()` can still ping an outside URL, but
// with fetch/XHR gone there is nothing of ours for it to read; only admins
// author templates.
const ready = prepareCompileWorker({
  warmUp: () => compileReactSource("export default () => null"),
  lock: () => lockDownGlobals(self, BLOCKED_WORKER_GLOBALS),
});

self.addEventListener("message", async (e: MessageEvent<{ id: number; source: string }>) => {
  await ready; // never run template code before the lockdown is in place
  try {
    self.postMessage({ id: e.data.id, html: await compileReactSource(e.data.source) });
  } catch (err) {
    self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
});
