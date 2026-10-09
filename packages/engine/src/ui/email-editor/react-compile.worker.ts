/// <reference lib="webworker" />
import { compileReactSource } from "../react-template";

// Admin-pasted code runs here, never on the dashboard page. A worker has no DOM
// or cookies; disabling the network globals stops it calling our API as the admin.
// ponytail: global stubs, not a true sandbox — a determined author can still
// reach `self` internals; acceptable because only admins author templates.
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts", "BroadcastChannel", "indexedDB", "caches"]) {
  try {
    Object.defineProperty(self, name, {
      value: () => {
        throw new Error(`${name} is not available in email templates`);
      },
      writable: false,
      configurable: false,
    });
  } catch {
    // already non-configurable in this runtime; leave it
  }
}

self.addEventListener("message", async (e: MessageEvent<{ id: number; source: string }>) => {
  try {
    self.postMessage({ id: e.data.id, html: await compileReactSource(e.data.source) });
  } catch (err) {
    self.postMessage({ id: e.data.id, error: err instanceof Error ? err.message : String(err) });
  }
});
