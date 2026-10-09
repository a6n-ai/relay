"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

export type SaveState = {
  status: "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
  savedAt?: number;
  attempt: number;
};
type Ev = { type: "edit" } | { type: "start" } | { type: "ok"; at: number } | { type: "fail" } | { type: "conflict" };

export function autosaveReducer(s: SaveState, ev: Ev): SaveState {
  if (s.status === "conflict") return s; // only a reload clears it
  switch (ev.type) {
    case "edit":
      return { status: "dirty", attempt: s.attempt, ...(s.savedAt ? { savedAt: s.savedAt } : {}) };
    case "start":
      return { ...s, status: "saving" };
    case "ok":
      return { status: "saved", savedAt: ev.at, attempt: 0 };
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

  const saveNow = useCallback(async () => {
    clearTimeout(timer.current);
    if (stateRef.current.status === "conflict") return;
    dispatch({ type: "start" });
    try {
      const r = await saveRef.current();
      dispatch(r === "conflict" ? { type: "conflict" } : { type: "ok", at: Date.now() });
    } catch {
      dispatch({ type: "fail" });
    }
  }, []);

  const markDirty = useCallback(() => {
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
    const dirty = state.status === "dirty" || state.status === "saving" || state.status === "error";
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return { state, markDirty, saveNow };
}
