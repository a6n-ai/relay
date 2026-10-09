/** Network and spawning APIs the React compile worker must not expose to template code. */
export const BLOCKED_WORKER_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "importScripts",
  "BroadcastChannel",
  "indexedDB",
  "caches",
  "Worker",
  "SharedWorker",
] as const;

/**
 * Replace each name with a throwing, read-only stub on the scope AND every
 * object up its prototype chain. Shadowing only `self` is bypassable via
 * `Object.getPrototypeOf(self).fetch.call(self, …)` (WorkerGlobalScope.prototype).
 */
export function lockDownGlobals(scope: object, names: readonly string[]): void {
  for (const name of names) {
    // A plain function (not an arrow) so `new XMLHttpRequest()` throws the same message.
    const stub = function blocked(): never {
      throw new Error(`${name} is not available in email templates`);
    };
    for (let o: object | null = scope; o; o = Object.getPrototypeOf(o)) {
      if (o !== scope && !Object.prototype.hasOwnProperty.call(o, name)) continue;
      try {
        Object.defineProperty(o, name, { value: stub, writable: false, configurable: false });
      } catch {
        // non-configurable in this runtime; the own-property stub on `scope` still shadows it
      }
    }
  }
}
