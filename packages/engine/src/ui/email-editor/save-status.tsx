"use client";

import { Button } from "@foundry/ui/button";
import type { SaveState } from "./autosave";

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Autosave state for an editor header: Saving… / Saved h:mm / Unable to save · Retry / changed elsewhere · Reload. */
export function SaveStatus({ state, onRetry, onReload }: { state: SaveState; onRetry: () => void; onReload: () => void }) {
  if (state.status === "conflict")
    return (
      <span role="alert" className="flex items-center gap-2 text-xs text-warn">
        Changed in another tab
        <Button type="button" size="sm" variant="outline" onClick={onReload}>
          Reload
        </Button>
      </span>
    );
  if (state.status === "error")
    return (
      <span role="alert" className="flex items-center gap-2 text-xs text-destructive">
        Unable to save
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </span>
    );
  const label =
    state.status === "saving"
      ? "Saving…"
      : state.status === "dirty"
        ? "Unsaved changes"
        : state.savedAt
          ? `Saved ${time(state.savedAt)}`
          : "";
  return (
    <span aria-live="polite" className="text-xs text-muted-foreground">
      {label}
    </span>
  );
}
