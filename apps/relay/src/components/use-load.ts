import { type DependencyList, useEffect } from "react";
import { errorText } from "./error-text";

// Loads data a form or panel needs after it mounts and drops the answer when the inputs changed or the page left. `null` skips the load.
export function useLoad<T>(
  load: (() => Promise<T>) | null,
  deps: DependencyList,
  { onData, onError, fallback }: { onData: (data: T) => void; onError: (copy: string) => void; fallback: string },
) {
  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (data) => live && onData(data),
      (err) => live && onError(errorText(err, fallback)),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller lists the inputs that restart the load
  }, deps);
}
