"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

export type SaveState = {
  status: "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
  savedAt?: number;
  attempt: number;
};
type Ev =
  | { type: "edit" }
  | { type: "start" }
  | { type: "ok"; at: number; stale?: boolean }
  | { type: "fail" }
  | { type: "conflict" };

export function autosaveReducer(s: SaveState, ev: Ev): SaveState {
  if (s.status === "conflict") return s; // only a reload clears it
  switch (ev.type) {
    case "edit":
      return { status: "dirty", attempt: s.attempt, ...(s.savedAt ? { savedAt: s.savedAt } : {}) };
    case "start":
      return { ...s, status: "saving" };
    case "ok":
      // An edit landed while this save was in flight: what's saved is older than the editor.
      return { status: ev.stale ? "dirty" : "saved", savedAt: ev.at, attempt: 0 };
    case "fail":
      return { ...s, status: "error", attempt: s.attempt + 1 };
    case "conflict":
      return { ...s, status: "conflict" };
  }
}

const BACKOFF = [2000, 4000, 8000];
export function retryDelayMs(attempt: number): number | null {
  return BACKOFF[attempt - 1] ?? null;
}

/**
 * Serializes saves: at most one runs; calls made meanwhile coalesce into one
 * follow-up that starts after it. Two concurrent saves would carry the same
 * revision and the second would 409 against the first.
 */
export function createSaveQueue<T>(fn: () => Promise<T>) {
  let current: Promise<T> | null = null;
  let next: Promise<T> | null = null;
  const start = (): Promise<T> => {
    current = fn().finally(() => {
      current = null;
    });
    return current;
  };
  return {
    run(): Promise<T> {
      if (!current) return start();
      next ??= current
        .catch(() => undefined)
        .then(() => {
          next = null;
          return start();
        });
      return next;
    },
  };
}

/** Debounced save with backoff. "Saved" only ever follows a resolved `save()`. */
export function useAutosave({
  enabled,
  save,
  debounceMs = 1500,
}: {
  enabled: boolean;
  save: () => Promise<"ok" | "conflict">;
  debounceMs?: number;
}) {
  const [state, dispatch] = useReducer(autosaveReducer, { status: "idle", attempt: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;
  const stateRef = useRef(state);
  stateRef.current = state;
  const edits = useRef(0);

  const queue = useRef(
    createSaveQueue(async (): Promise<"ok" | "conflict" | "error"> => {
      if (stateRef.current.status === "conflict") return "conflict";
      const seenEdits = edits.current;
      dispatch({ type: "start" });
      try {
        const r = await saveRef.current();
        dispatch(r === "conflict" ? { type: "conflict" } : { type: "ok", at: Date.now(), stale: edits.current !== seenEdits });
        return r;
      } catch {
        dispatch({ type: "fail" });
        return "error";
      }
    }),
  );

  // Resolves with the outcome so an explicit Save button can act on it.
  const saveNow = useCallback((): Promise<"ok" | "conflict" | "error"> => {
    clearTimeout(timer.current);
    return queue.current.run();
  }, []);

  /** Drop a pending debounced save (e.g. the editor is closing). */
  const cancel = useCallback(() => clearTimeout(timer.current), []);

  const markDirty = useCallback(() => {
    edits.current += 1;
    dispatch({ type: "edit" });
    if (!enabled) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, debounceMs);
  }, [enabled, debounceMs, saveNow]);

  // Automatic retries after a failure; past the last backoff step the UI shows Retry.
  useEffect(() => {
    if (!enabled || state.status !== "error") return;
    const delay = retryDelayMs(state.attempt);
    if (delay === null) return;
    timer.current = setTimeout(saveNow, delay);
    return () => clearTimeout(timer.current);
  }, [enabled, state.status, state.attempt, saveNow]);

  useEffect(() => {
    const dirty = state.status !== "idle" && state.status !== "saved";
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { state, markDirty, saveNow, cancel };
}
